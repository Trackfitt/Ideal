const express = require('express');
const router = express.Router();
const checkoutController = require('../controllers/checkout');
const { validateWebhookSignature } = require('../middlewares/paystack');


// Single route for checkout
router.post('/', checkoutController.checkout);

// Single webhook route with both middleware
router.post('/webhook',
    express.raw({ type: 'application/json' }),
    validateWebhookSignature,
    checkoutController.webhook
);


module.exports = router;