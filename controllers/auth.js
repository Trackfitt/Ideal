const { validationResult } = require('express-validator'); // Import express-validator to handle validation of request bodies
const { User } = require('../models/user'); // Import User model from the models folder to interact with the User collection
const bcrypt = require('bcryptjs'); // Import bcryptjs to handle password hashing
const jwt = require('jsonwebtoken'); // Import jsonwebtoken to create and verify JWT tokens
const { Token } = require('../models/token'); // Import Token model to manage refresh tokens in the database
const mailSender = require('../helpers/email_sender'); // Import email sender utility for sending OTP emails

// Register a new user
exports.register = async function (req, res) {
    const errors = validationResult(req); // Check for validation errors in the request body
    if (!errors.isEmpty()) {
        const errorMessages = errors.array().map((error) => ({
            field: error.path, // The field that caused the error
            message: error.msg, // The error message
        }));
        return res.status(400).json({ errors: errorMessages }); // Return 400 error if validation fails
    }
    try {
        let user = new User({
            ...req.body, // Spread the request body into a new user object
            passwordHash: bcrypt.hashSync(req.body.password, 8), // Hash the user's password before storing
        });
        user = await user.save(); // Save the new user to the database

        if (!user) {
            return res.status(500).json({ type: 'Internal Server Error', message: 'Cannot create user' }); // Return error if user creation fails
        }
        return res.status(201).json(user); // Return the created user on success
    } catch (error) {
        console.error(error); // Log any errors to the console
        if (error.message.includes('email_1 dup key')) { // Handle duplicate email registration errors
            return res.status(409).json({
                type: 'AuthError',
                message: 'Email already registered',
            });
        }
        return res.status(500).json({ type: error.name, message: error.message }); // Handle other errors
    }
};

// Log in a user
exports.login = async function (req, res) {
    try {
        const { email, password } = req.body; // Extract email and password from the request body
        const user = await User.findOne({ email }); // Find the user by email in the database
        if (!user) {
            return res.status(404).json({ message: 'User not found. Check your email and try again.' }); // Return error if no user is found
        }
        if (!bcrypt.compareSync(password, user.passwordHash)) { // Compare input password with hashed password
            return res.status(400).json({ message: 'Password is incorrect' }); // Return error if passwords don't match
        }

        // Generate access and refresh tokens for the authenticated user
        const accessToken = jwt.sign(
            { id: user.id, isAdmin: user.isAdmin }, // Include user ID and admin status in token payload
            process.env.ACCESS_TOKEN_SECRET, // Use secret key from environment variables
            { expiresIn: '24h' }, // Set access token expiration to 24 hours
        );

        const refreshToken = jwt.sign(
            { id: user.id, isAdmin: user.isAdmin },
            process.env.REFRESH_TOKEN_SECRET,
            { expiresIn: '60d' }, // Set refresh token expiration to 60 days
        );

        const token = await Token.findOne({ userId: user.id }); // Find if a token already exists for the user
        if (token) await token.deleteOne(); // If a token exists, delete it
        await new Token({
            userId: user.id,
            accessToken,
            refreshToken,
        }).save(); // Save the new access and refresh tokens in the database

        user.passwordHash = undefined; // Remove the password hash from the user object before returning
        return res.json({ ...user._doc, accessToken }); // Return the user details and access token
    } catch (error) {
        console.error(error); // Log errors to the console
        return res.status(500).json({ type: error.name, message: error.message }); // Handle any errors
    }
};

// Verify the validity of a token
exports.verifyToken = async function (req, res) {
    try {
        let accessToken = req.headers.authorization; // Get access token from the request headers
        if (!accessToken) return res.json(false); // If no token is provided, return false
        accessToken = accessToken.replace('Bearer', '').trim(); // Remove the 'Bearer' prefix from the token

        const token = await Token.findOne({ accessToken }); // Check if the token exists in the database
        if (!token) return res.json(false); // If no token is found, return false

        const tokenData = jwt.decode(token.refreshToken); // Decode the refresh token to extract user data

        const user = await User.findById(tokenData.id); // Find the user by ID
        if (!user) return res.json(false); // If user doesn't exist, return false

        const isValid = jwt.verify(token.refreshToken, process.env.REFRESH_TOKEN_SECRET); // Verify the refresh token
        if (!isValid) return res.json(false); // If the token is not valid, return false
        return res.json(true); // If all checks pass, return true
    } catch (error) {
        console.error(error); // Log errors to the console
        return res.status(500).json({ type: error.name, message: error.message }); // Handle any errors
    }
};

// Handle forgot password requests
exports.forgotPassword = async function (req, res) {
    try {
        const { email } = req.body; // Extract email from the request body

        const user = await User.findOne({ email }); // Find the user by email
        if (!user) {
            return res.status(404).json({ message: 'User with that email does not exist' }); // If no user is found, return an error
        }

        const OTP = Math.floor(1000 + Math.random() * 9000); // Generate a random 4-digit OTP

        user.resetPasswordOtp = OTP; // Save the OTP to the user's document
        user.resetPasswordOtpExpires = Date.now() + 600000; // Set the OTP expiration time to 10 minutes

        await user.save(); // Save the updated user document

        const response = await mailSender.sendmail( // Send the OTP to the user's email
            email,
            'Password reset OTP',
            `Your OTP for password reset is ${OTP}`,
        );
        return res.json({ message: response }); // Return the email sending response
    } catch (error) {
        console.error(error); // Log errors to the console
        return res.status(500).json({ type: error.name, message: error.message }); // Handle any errors
    }
};

// Verify the OTP for password reset
exports.verifyPasswordOtp = async function (req, res) {
    try {
        const { email, OTP } = req.body; // Extract email and OTP from the request body

        const user = await User.findOne({ email }); // Find the user by email
        if (!user) {
            return res.status(404).json({ message: 'User not found' }); // If no user is found, return an error
        }
        // Check if OTP matches and is not expired
        if (user.resetPasswordOtp !== +OTP || Date.now() > user.resetPasswordOtpExpires) {
            return res.status(401).json({ message: 'Invalid or expired OTP' }); // Return error if OTP is invalid or expired
        }
        user.resetPasswordOtp = 1; // Mark OTP as confirmed
        user.resetPasswordOtpExpires = undefined; // Clear OTP expiration

        await user.save(); // Save the updated user document
        return res.json({ message: 'OTP confirmed successfully.' }); // Return success message
    } catch (error) {
        console.error(error); // Log errors to the console
        return res.status(500).json({ type: error.name, message: error.message }); // Handle any errors
    }
};

// Reset the user's password after OTP confirmation
exports.resetPassword = async function (req, res) {
    const errors = validationResult(req); // Check for validation errors in the request body
    if (!errors.isEmpty()) {
        const errorMessages = errors.array().map((error) => ({
            field: error.path,
            message: error.msg,
        }));
        return res.status(400).json({ errors: errorMessages }); // Return 400 error if validation fails
    }
    try {
        const { email, newPassword } = req.body; // Extract email and new password from the request body

        const user = await User.findOne({ email }); // Find the user by email
        if (!user) {
            return res.status(404).json({ message: 'User not found' }); // If no user is found, return an error
        }

        if (user.resetPasswordOtp !== 1) {
            return res.status(401).json({ message: 'Confirm OTP before resetting password.' }); // If OTP is not confirmed, return an error
        }

        user.passwordHash = bcrypt.hashSync(newPassword, 8); // Hash the new password and update the user document
        user.resetPasswordOtp = undefined; // Clear the OTP field

        await user.save(); // Save the updated user document
        return res.json({ message: 'Password changed successfully' }); // Return success message
    } catch (error) {
        console.error(error); // Log errors to the console
        return res.status(500).json({ type: error.name, message: error.message }); // Handle any errors
    }
};




/*{
  "email": "dead@deadboy.com",
  "password": "DeadEmpress@12"
}*/