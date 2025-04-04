// Importing the express-jwt middleware
const { expressjwt: expjwt } = require("express-jwt");
const { Token } = require("../models/token"); // Importing the Token model to handle token verification

// Function to set up JWT authentication middleware
function authJwt() {
    const API = process.env.API_URL; // Get the base API URL from environment variables
    
    // Return the express-jwt middleware with settings
    return expjwt({
        secret: process.env.ACCESS_TOKEN_SECRET, // JWT secret key from environment variables
        algorithms: ['HS256'], // Algorithm to decode the JWT (HMAC-SHA256)
        isRevoked: isRevoked // Callback function to check if a token is revoked
    }).unless({
        // Define paths that do not require authentication (e.g., login, register, forgot-password, etc.)
        path: [
            `${API}/login`,
            `${API}/login/`,
            `${API}/register`,
            `${API}/register/`,
            `${API}/forgot-password`,
            `${API}/forgot-password/`,
            `${API}/verify-otp`,
            `${API}/verify-otp/`,
            `${API}/reset-password`,
            `${API}/reset-password/`
        ]
    });
}

// This function checks if the JWT is revoked (i.e., no longer valid)
async function isRevoked(req, jwt) {
    const authHeader = req.header('Authorization'); // Get the Authorization header from the request

    // If the Authorization header doesn't start with 'Bearer', it means there's no valid token
    if (!authHeader.startsWith('Bearer')) {
        return true; // Token is revoked
    }

    // Remove 'Bearer' from the token string and trim any spaces
    const accessToken = authHeader.replace('Bearer', '').trim();

    // Look for the token in the database to ensure it is valid
    const token = await Token.findOne({ accessToken });

    // Define a regex to match admin route URLs (e.g., routes that start with '/api/v1/admin/')
    const adminRouteRegex = /^\/api\/v1\/admin\//i;

    // If the user is not an admin but is trying to access an admin route, revoke the token
    const adminFault = !jwt.payload.isAdmin && adminRouteRegex.test(req.originalUrl);

    // If the token doesn't exist in the database or the user tries to access an admin route without admin rights, revoke the token
    return adminFault || !token;
}

module.exports = authJwt; // Export the authJwt middleware function
