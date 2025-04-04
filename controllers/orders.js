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

const verifyLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // limit each IP to 100 requests per windowMs
});

const MAX_RETRIES = 3;

async function handleConflict(orderData, session, retries) {
  if (retries < MAX_RETRIES) {
    await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait for a second
    return createOrderWithRetry(orderData, session, retries + 1);
  } else {
    await session.abortTransaction();
    await session.endSession();
    return console.trace(
      'ORDER CREATION FAILED: Order conflict, please try again later'
    );
  }
}

// Modify function signature to accept session
async function createOrderWithRetry(orderData, session, retries) {
  retries = retries ?? 0;
  if (!mongoose.isValidObjectId(orderData.user)) {
    return console.error('User Validation Failed: Invalid user!');
  }

  try {
    logTransaction(session, 'Order processing'); // Log transaction start

    const user = await User.findById(orderData.user);
    if (!user) {
      await session.abortTransaction();
      await session.endSession();
      return console.trace('ORDER CREATION FAILED: User not found');
    }

    const orderItems = orderData.orderItems;
    const orderItemsIds = [];
    for (const orderItem of orderItems) {
      const product = await Product.findById(orderItem.product).session(session);
      if (!product) {
        await session.abortTransaction();
        await session.endSession();
        throw new Error(`Product ${orderItem.product} not found`);
      }

      const cartProduct = await CartProduct.findById(orderItem.cartProductId).session(session);
      if (!cartProduct) {
        await session.abortTransaction();
        await session.endSession();
        return console.trace(
          'ORDER CREATION FAILED: Invalid product in the order'
        );
      }
      let orderItemModel = await new OrderItem(orderItem).save({ session });
      if (!orderItemModel) {
        await session.abortTransaction();
        await session.endSession();
        const message = `An order for product ${product.name} could not be created`;
        console.trace('ORDER CREATION FAILED: ', message);
        return handleConflict(orderData, session, retries);
      }

      if (cartProduct.reserved) {
        // Mark as processed
        cartProduct.reserved = false;
        cartProduct.processed = true;
        await cartProduct.save({ session });
      } else {
        // Handle non-reserved items
        product.countInStock -= orderItemModel.quantity;
        await product.save({ session });
      }

      // Remove from cart
      user.cart.pull(cartProduct.id);
      await user.save({ session });

      orderItemsIds.push(orderItemModel._id);
    }

    orderData['orderItems'] = orderItemsIds;

    return await addOrder(session, orderData);
  } catch (err) {
    await session.abortTransaction();
    await session.endSession();
    console.error(err);
    return console.log(
      'ORDER CREATION FAILED: ',
      JSON.stringify({
        type: err.name,
        message: err.message,
      })
    );
  }
}

async function addOrder(session, orderData) {
  let order = new Order(orderData);

  order.status = 'processed';
  order.statusHistory.push('processed');

  order = await order.save({ session });

  if (!order) {
    await session.abortTransaction();
    await session.endSession();
    return console.trace(
      'ORDER CREATION FAILED: The order could not be created'
    );
  }

  await session.commitTransaction();
  await session.endSession();

  return order;
}

// Modify addOrder to accept session
exports.addOrder = async (orderData, session) => {
  return await createOrderWithRetry(orderData, session, 0);
};

exports.getUserOrders = async (req, res) => {
  try {
    const orders = await Order.find({ user: req.params.userId })
      .select('orderItems status totalPrice dateOrdered')
      .populate({
        path: 'orderItems',
        select: 'productName productImage',
      })
      .sort({ dateOrdered: -1 });
    if (!orders) {
      return res.status(404).json({ message: 'Product not found' });
    }
    const completed = [];
    const active = [];
    const cancelled = [];
    for (const order of orders) {
      if (order.status === 'delivered') {
        completed.push(order);
      } else if (['cancelled', 'expired'].includes(order.status)) {
        cancelled.push(order);
      } else {
        active.push(order);
      }
    }
    return res.json({ total: orders.length, active, completed, cancelled });
  } catch (err) {
    return res.status(500).json({ type: err.name, message: err.message });
  }
};

exports.getOrderById = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id).populate('orderItems');
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }
    return res.json(order);
  } catch (err) {
    return res.status(500).json({ type: err.name, message: err.message });
  }
};

// you can implement this if you want and add a cron job to return their money or
// have the admins do this manually, send a notification to the admin dashboard to return their money
// exports.cancelOrder = async (req, res)

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
    let attempts = 0;
    const MAX_WEBHOOK_RETRIES = 3;

    while (attempts < MAX_WEBHOOK_RETRIES) {
        try {
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

                    // Pass webhook session to order creation
                    const order = await orderController.addOrder({
                        orderItems: metadata.cartItems.map(item => ({
                            product: item.productId,
                            cartProductId: item._id,
                            quantity: item.quantity,
                            selectedSize: item.selectedSize,
                            selectedColor: item.selectedColor,
                            productPrice: item.price, // Use DB price
                            productName: item.name,
                            productImage: item.image
                        })),
                        user: metadata.userId,
                        totalPrice: metadata.totalAmount,
                        paymentId: reference,
                        status: 'processed'
                    }, session);

                    // Remove cart cleanup from here

                    // Send email (outside transaction as it's not critical)
                    try {
                        await mailSender.sendmail(
                            event.data.customer.email,
                            'Order Confirmation',
                            `Order #${order._id} confirmed! Total: ₦${metadata.totalAmount}`
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
        } catch (error) {
            attempts++;
            await new Promise(resolve => setTimeout(resolve, 1000 * attempts));
        }
    }

    return res.status(500).json({ message: 'Webhook processing failed after multiple attempts' });
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