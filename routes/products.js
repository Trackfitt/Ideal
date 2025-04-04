const express = require('express');
const router = express.Router();
const productsController = require('../controllers/products');
const reviewsController = require('../controllers/reviews');

router.get('/', productsController.getProducts);
router.search('/search', productsController.searchProducts);

router.get('/:id', productsController.getProductById);
router.post('/:id/reviews', reviewsController.leaveReviews);
router.get('/:id/reviews', reviewsController.getProductReview);

module.exports = router;