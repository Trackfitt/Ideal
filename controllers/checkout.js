const jwt = require('jsonwebtoken');
const { User } = require('../models/user');
const { Product } = require('../models/product');
const Paystack = require('paystack')(process.env.PAYSTACK_SECRET_KEY);
const crypto = require('crypto');
const { Order } = require('../models/order');
const { OrderItem } = require('../models/order_item');
const { CartProduct } = require('../models/cart_product');
const mailSender = require('../helpers/email_sender');
const mongoose = require('mongoose');
const rateLimit = require('express-rate-limit');
const orderController = require('./orders'); // Import order controller
const { logTransaction } = require('../utils/transaction_logger'); // Import transaction logger
const { buildEmail } = require('../helpers/order_complete_email_builder');

const verifyLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // limit each IP to 100 requests per windowMs
});

exports.checkout = async (req, res) => {
    try {
        if (!req.body.cartItems || !Array.isArray(req.body.cartItems)) {
            return res.status(400).json({
                message: 'Invalid request: cartItems must be an array'
            });
        }

        const accessToken = req.headers.authorization.replace('Bearer', '').trim();
        const tokenData = jwt.verify(accessToken, process.env.ACCESS_TOKEN_SECRET);
        
        const user = await User.findById(tokenData.id);
        if(!user) {
            return res.status(404).json({message: 'User not found'});
        }

        if (!user.street) {
            return res.status(400).json({
                message: 'Shipping address required'
            });
        }

        let totalAmount = 0;
        const session = await mongoose.startSession();
        session.startTransaction();
        
        try {
            logTransaction(session, 'Checkout started'); // Log transaction start

            const reference = `ORDER-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;

            for(const cartItem of req.body.cartItems) {
                const product = await Product.findById(cartItem.productId).session(session);
                if(!product) {
                    throw new Error(`${cartItem.name} not found`);
                }

                if(!cartItem.reserved) {
                    if(product.countInStock < cartItem.quantity) {
                        throw new Error(
                            `${product.name}: Only ${product.countInStock} left in stock`
                        );
                    }
                    // Update product stock
                    product.countInStock -= cartItem.quantity;
                    product.reservedQuantity += cartItem.quantity; // New field for reserved quantity
                    await product.save({ session });

                    // Update CartProduct reservation status
                    const cartProduct = await CartProduct.findById(cartItem._id).session(session);
                    if (!cartProduct) {
                        throw new Error('Cart product not found');
                    }
                    cartProduct.reserved = true;
                    cartProduct.reservationExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 min
                    await cartProduct.save({ session });
                }
                
                totalAmount += product.price * cartItem.quantity;
            }

            // Initialize Paystack transaction
            const TRANSACTION_TIMEOUT = 15 * 60 * 1000; // 15 minutes

            const response = await Promise.race([
                Paystack.transaction.initialize({
                    reference,
                    email: user.email,
                    amount: totalAmount * 100,
                    currency: 'NGN', // Explicit currency
                    callback_url: `${process.env.CLIENT_SUCCESS_URL}/success`,
                    metadata: {
                        userId: user.id,
                        totalAmount: totalAmount,
                        cartItems: req.body.cartItems.map(item => ({
                            productId: item.productId,
                            quantity: item.quantity,
                            selectedSize: item.selectedSize, // Add
                            selectedColor: item.selectedColor // Add
                        }))
                    }
                }),
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Transaction timeout')), TRANSACTION_TIMEOUT)
                )
            ]);

            if (!response.status) {
                throw new Error('Payment initialization failed');
            }

            await session.commitTransaction();
            return res.status(200).json({
                authorization_url: response.data.authorization_url,
                reference: response.data.reference
            });

        } catch (error) {
            await session.abortTransaction();
            console.error('Checkout Error:', error);
            return res.status(500).json({ 
                type: error.name, 
                message: error.message 
            });
        } finally {
            session.endSession();
        }
    } catch (error) {
        console.error('Checkout Error:', error);
        return res.status(500).json({ 
            type: error.name, 
            message: error.message 
        });
    }
};

exports.webhook = async (req, res) => {
    // Verify webhook signature
    const hash = crypto
        .createHmac('sha512', process.env.PAYSTACK_SECRET_KEY)
        .update(JSON.stringify(req.body))
        .digest('hex');

    if (hash !== req.headers['x-paystack-signature']) {
        return res.status(401).end();
    }

    const event = req.body;
    
    if (event.event === 'charge.success') {
        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            const { metadata, reference } = event.data;
            
            // Check for duplicate processing with session
            const existingOrder = await Order.findOne({ 
                paymentId: reference 
            }).session(session);

            if (existingOrder) {
                console.log('Duplicate webhook detected for:', reference);
                await session.abortTransaction();
                return res.status(200).end();
            }

            // Create order items with session
            const orderItems = await Promise.all(
                metadata.cartItems.map(async (item) => {
                    const product = await Product.findById(item.productId).session(session);
                    if (!product) throw new Error(`Product ${item.productId} not found`);

                    return new OrderItem({
                        product: item.productId,
                        quantity: item.quantity,
                        selectedSize: item.selectedSize,
                        selectedColor: item.selectedColor,
                        productPrice: product.price, // Use DB price
                        productName: product.name,
                        productImage: product.image
                    }).save({ session });
                })
            );

            // Create order with session
            const order = await new Order({
                orderItems: orderItems.map(item => item._id),
                user: metadata.userId,
                totalPrice: metadata.totalAmount,
                paymentId: reference,
                status: 'processed'
            }).save({ session });

            // Clear cart with session
            await CartProduct.deleteMany({ 
                _id: { $in: metadata.cartItems.map(item => item._id) },
                user: metadata.userId // Add user scope
            }).session(session);

            // Update user cart with session
            await User.findByIdAndUpdate(
                metadata.userId,
                { $set: { cart: [] } },
                { session }
            );

            // Send email (outside transaction as it's not critical)
            try {
                const emailContent = buildEmail(user.name, order, user.name);
                await mailSender.sendmail(
                    event.data.customer.email,
                    'Order Confirmation',
                    emailContent
                );
            } catch (emailError) {
                console.error('Email Error:', emailError);
            }

            await session.commitTransaction();
            return res.status(200).end();

        } catch (error) {
            await session.abortTransaction();
            console.error('Webhook Transaction Error:', error);
            return res.status(500).end();
        } finally {
            session.endSession();
        }
    }

    return res.status(200).end();
};

exports.verifyTransaction = async (req, res) => {
    try {
        const reference = req.query.reference;
        if (!reference) {
            return res.status(400).json({ message: 'No reference provided' });
        }

        const verification = await Paystack.transaction.verify(reference);
        if (!verification.status) {
            return res.status(400).json({ message: 'Transaction verification failed' });
        }

        return res.json({
            status: verification.data.status,
            message: 'Transaction verified successfully'
        });
    } catch (error) {
        console.error('Verification Error:', error);
        return res.status(500).json({ 
            type: error.name, 
            message: error.message 
        });
    }
};

// Stock release function
exports.releaseReservedStock = async (cartItems) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        for(const item of cartItems) {
            const cartProduct = await CartProduct.findById(item._id).session(session);
            if(cartProduct?.reserved) {
                const product = await Product.findById(item.productId).session(session);
                product.countInStock += item.quantity;
                product.reservedQuantity -= item.quantity; // Adjust reserved quantity
                await product.save({ session });
                
                cartProduct.reserved = false;
                await cartProduct.save({ session });
            }
        }

        await session.commitTransaction();
    } catch (error) {
        await session.abortTransaction();
        console.error('Stock Release Error:', error);
    } finally {
        session.endSession();
    }
};