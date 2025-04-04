const crypto = require('crypto');

exports.validateWebhookSignature = (req, res, next) => {
    const secret = process.env.PAYSTACK_SECRET_KEY;
    const hash = crypto
        .createHmac('sha512', secret)
        .update(JSON.stringify(req.body))
        .digest('hex');

    if (hash === req.headers['x-paystack-signature']) {
        next();
    } else {
        res.status(401).send('Invalid signature');
    }
};
