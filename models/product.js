const { Schema, model } = require('mongoose');

const productSchema = Schema({
    name:{type: String, required: true},
    description: {type: String, required: true},
    price:{type: Number, required: true},
    ratings:{type: Number, default: 0.0 },
    colours:[{type: String}],
    image: {type: String, required: true},
    images: [{type: String}],
    reviews: [{type: Schema.Types.ObjectId, ref: 'Review'}],
    numbersOfReviews: {type: Number, default: 0},
    size: [{type: String}],
    category: {type: Schema.Types.ObjectId, ref: 'Category', required: true},
    genderAgeCategory: {type: String, enum:['Men', 'Women', 'Unisex', 'Kids']},
    countInStock: {type: Number, required: true, min: 0, max: 400},
    dateAdded: {type: Date, default: Date.now},
    productSalesCount: { type: Number, default: 0 } 
});

// pre save-hooks
productSchema.pre('save', async function(next) {
    if(this.reviews.length > 0) {
        await this.populate('reviews');

        const totalRating = this.reviews.reduce(
            (acc, review) => acc + review.rating,
            0
        );
        this.rating = totalRating / this.reviews.length;
        this.rating = parseFloat((totalRating / this.reviews.length).toFixed(1));
    }
    next();
});
productSchema.index({name: 'text', description: 'text'});

productSchema.set('toObject',{virtuals: true});
productSchema.set('toJSON',{virtulas: true});

exports.Product = model('Product', productSchema);