const { unlink } = require('fs/promises');
const multer = require('multer');
const path = require('path');

// Define allowed MIME types and their extensions
const ALLOWED_EXTENSIONS = {
    'image/png': 'png',
    'image/jpeg': 'jpeg',
    'image/jpg': 'jpg',
    'image/gif': 'gif',
    'video/mp4': 'mp4',
    'video/avi': 'avi',
    'video/mov': 'mov',
    'video/wmv': 'wmv',
};

// Configure storage
const storage = multer.diskStorage({
    destination: function (_, _, cb) {
        cb(null, 'public/uploads'); // Set the destination for uploads
    },
    filename: function (_, file, cb) {
        // Validate MIME type before processing
        const extension = ALLOWED_EXTENSIONS[file.mimetype];
        if (!extension) {
            return cb(new Error('Invalid file type'), false);
        }

        // Sanitize and generate a unique filename
        const sanitizedFilename = file.originalname
            .replace(/\s+/g, '-') // Replace spaces with dashes
            .replace(/[^a-zA-Z0-9.\-_]/g, ''); // Remove special characters
        const uniqueName = `${path.parse(sanitizedFilename).name}-${Date.now()}.${extension}`;
        cb(null, uniqueName);
    },
});

// Multer configuration
exports.upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 * 1024 }, // Limit file size to 5GB
    fileFilter: (_, file, cb) => {
        const isValid = ALLOWED_EXTENSIONS[file.mimetype];
        if (!isValid) {
            return cb(
                new Error(`Invalid file type: ${file.mimetype} is not allowed`),
                false
            );
        }
        cb(null, true); // Accept the file
    },
});

exports.deleteImages = async function (imageUrls, continueOnErrorName) {
    await Promise.all(
        imageUrls.map(async(imageUrls) => {
            const imagePath = path.resolve(
                __dirname,
                '..',
                'public',
                'uploads',
                path.basename(imageUrl)
            );
            try{
                await unlink(imagePath);
            }catch (error) {
                if(error.code === continueOnErrorName) {
                    console.error(`Continuing with the next image ${error.message}`);
                }else{
                    console.error(`Error deleting image ${error.message}`);
                    throw error;
                }
            }
        })
    );
};