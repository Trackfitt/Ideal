const cron = require('node-cron');
const { Category } = require('../models/category');
const { Product } = require('../models/product');
const { CartProduct } = require('../models/cart_product');
const { deafult: mongoose } = require('mongoose');

cron.schedule('0 0 * * *', async function () {
    try{
        const categoriesToBeDeleted = await Category.find({
         markedForDeletion: true,});
         for(const category of categoriesToBeDeleted) {
            const categoryProductsCount = await Product.countDocument({
                category:category.id,
            });
            if(categoryProductsCount < 1) await category.deleteOne();
         }
         console.log('CRON job completed at', new Date());
    }catch{
        console.error('CRON job error:', error);
    }
});
cron.schedule('*/30 * * * *', async () => { // Fixed cron syntax (no space)
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        console.log('Reservation release cron job started at', new Date());

        // 1. Find expired reservations
        const expiredReservations = await CartProduct.find({
            reserved: true,
            reservationExpiry: { $lte: new Date() } // Fixed $lte typo
        }).session(session);

        // 2. Process each reservation
        for(const cartProduct of expiredReservations) {
            const product = await Product.findById(cartProduct.product).session(session);
            
            if(product) {
                // 3. Restore product stock
                const updatedProduct = await Product.findByIdAndUpdate(
                    product._id,
                    { 
                        $inc: { countInStock: cartProduct.quantity },
                        $unset: { reservedUntil: 1 } // Clear reservation timestamp
                    },
                    { new: true, runValidators: true, session } // Fixed typo
                );

                if(!updatedProduct) {
                    console.error('Product update failed for:', product._id);
                    continue; // Don't abort entire transaction
                }
            }

            // 4. Update cart product status
            await CartProduct.findByIdAndUpdate(
                cartProduct._id,
                { reserved: false },
                { session }
            );
        }

        await session.commitTransaction();
        console.log('Reservation release cron job completed at', new Date());
        
    } catch (error) {
        console.error('Cron Job Error:', error);
        await session.abortTransaction();
    } finally {
        session.endSession();
    }
});