const express = require('express');
const router = express.Router();

const usersControllers = require('../controllers/user');  
const wishlistController =require('../controllers/wishlists');
const cartController =require('../controllers/cart');

router.get('/', usersControllers.getUsers);
router.get('/:id', usersControllers.getUserById);  
router.put('/:id', usersControllers.updateUser); 

//Wishlist
router.get('/:id/wishlist', wishlistController.getUserWishlist);
router.post('/:id/wishlist', wishlistController.addToWishlist);
router.delete('/:id/wishlist/:productId', wishlistController.removeFromWishlist);

//Cart
router.get('/:id/cart', cartController.getUserCart);
router.get('/:id/cart/count', cartController.getUserCartCount);
router.get('/:id/cart/:cartProductId', cartController.getCartProductById);
router.post('/:id/cart', cartController.addToCart);
router.put('/:id/cart/:cartProductId', cartController.modifyProductQuantity);
router.delete('/:id/cart/:cartProductId', cartController.removeFromCart);

module.exports = router;
