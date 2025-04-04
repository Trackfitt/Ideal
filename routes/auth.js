const express = require('express');  // Import Express to handle routing
const router = express.Router();  // Create an Express router to define routes

const authController = require('../controllers/auth');  // Import the authentication controller which contains the logic for each route

const { body } = require('express-validator');  // Import express-validator's 'body' to validate request bodies

// Validation rules for registering a new user
const validateUser = [
    body('name').not().isEmpty().withMessage('Name is required'),  // Ensure 'name' field is not empty, else return an error message
    body('email').isEmail().withMessage('Please enter a valid email address'),  // Ensure 'email' field is a valid email
    body('password')
     .isLength({min: 8}).withMessage('Password must be at least 8 characters')  // Ensure 'password' is at least 8 characters long
     .isStrongPassword().withMessage('Password must contain one uppercase, one lowercase, one symbol and one number.'),  // Ensure password strength: uppercase, lowercase, symbol, and number
    body('phone').isMobilePhone().withMessage('Please enter a valid phone number'),  // Ensure 'phone' field is a valid mobile number
];
 
// Validation rules for resetting password
const validatePassword = [
    body('newPassword')
     .isLength({min: 8}).withMessage('Password must be at least 8 characters')  // Ensure new password is at least 8 characters long
     .isStrongPassword().withMessage('Password must contain one uppercase, one lowercase, one symbol and one number.'),  // Ensure new password strength
];

// Define routes

// Login route: handles user login, using authController.login logic
router.post('/login', authController.login);

// Register route: validates user data using 'validateUser' middleware, then calls authController.register to handle registration
router.post('/register', validateUser, authController.register);

// Verify token route: checks if the token is valid using authController.verifyToken logic
router.get('/verify-token', authController.verifyToken);

// Forgot password route: initiates forgot password process using authController.forgotPassword logic
router.post('/forgot-password', authController.forgotPassword);

// Verify OTP route: validates OTP for password reset using authController.verifyPasswordOtp logic
router.post('/verify-otp', authController.verifyPasswordOtp);

// Reset password route: validates new password using 'validatePassword' middleware, then calls authController.resetPassword logic
router.post('/reset-password', validatePassword, authController.resetPassword);

// Export the router to make it accessible in other parts of the application
module.exports = router;
