const media_helper = require ('../../helpers/media_helper');  
const util = require ('util');
const {Category} = require('../../models/category');

exports.addCategory = async function (req, res) {
    try{
        const uploadImage = util.promisfiy(
            media_helper.upload.fields([{name: 'image', maxCount: 1}])
        );
        try{
            await uploadImage(req, res);
        }catch (error) {
            console.error(error);
            return res.status(500).json({
                type: error.code,
                message: `${error.message}{${err.field}}`,
                storageErrors: errors.storageErrors,
            });
        }
        const image = req.files['image'] [0];
        if(!image) return res.status(404). json({message: 'No File Found'});

        req.body['image'] = `${req.protocol}://${req.get('host')}/${image.path}`;
        let category = new Category(req.body);

        category = category.save();
        if(!category) {
            return res.status(500).json({message: 'This category could not be created'});
        }
        return res.status(201).json(category);

    } catch (error) {
        console.error(error); // Log errors to the console
        return res.status(500).json({ type: error.name, message: error.message }); // Handle any errors
    }
};

exports.editCategory = async function (req, res) {
    try{
        const {name, icon, colour} = req.body;
        const category = Category.findByIdAndUpdate(
            req.params.id,
            {name,icon,colour},
            {new: true},
        );
    }catch (error) {
        console.error(error); // Log errors to the console
        return res.status(500).json({ type: error.name, message: error.message }); // Handle any errors
    }
};


exports.deleteCategory = async function (req, res) {
    try{
        const category = await Category.findById(req.params.id);
        if(!category) {
            return res.status(404).json({message: 'Category npot found'});
        }
        category.markedForDeletion = true;
        await category.save();
        return res.status(204).end();
    } catch (error) {
        console.error(error); // Log errors to the console
        return res.status(500).json({ type: error.name, message: error.message }); // Handle any errors
    }
};