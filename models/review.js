const {Schema, model} = require('mongoose');

const reviewSchema = Schema({
    user: {type: Schema.Types.ObjectId, ref: 'User', required: true},
    usermname: {type: String, require: true},
    comment: {type: String, trim: true},
    image: {type: String, require: true},
    rating: {type: Number, required: true},
    date: {type:Date, default: Date.now},
});
reviewSchema.set('toObject', {virtuals: true});
reviewSchema.set('toJson', {virtuals: true});

exports.Review = model('Review', reviewSchema);