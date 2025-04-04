const jwt = require('jsonwebtoken');
const { Token } = require('../models/token');

// Middleware to handle errors in the application
async function errorHandler(error, req, res, next) {
  
  // Check if the error is related to an unauthorized action
  if (error.name === 'Unauthorized') {
    
    // Handle cases where the JWT is expired
    if (!error.message.includes('jwt expired')) {
      return res.status(error.status || 401).json({
        type: error.name,
        message: error.message
      });  // Send unauthorized error if the issue isn't with an expired JWT
    }
    
    try {
      // Extract the Authorization header from the request
      const tokenHeader = req.header('Authorization');
      
      // Ensure Authorization header exists and starts with 'Bearer '
      if (!tokenHeader || !tokenHeader.startsWith('Bearer ')) {
        return res.status(401).json({
          type: 'Unauthorized',
          message: 'Invalid token format'
        });  // Invalid token format error
      }
      
      // Get the access token by splitting the Authorization header
      const accessToken = tokenHeader.split(' ')[1];

      // Find the token in the database, ensuring a refresh token exists
      const token = await Token.findOne({
        accessToken,
        refreshToken: { $exists: true }  // Ensure refresh token exists in the token entry
      });

      if (!token) {
        return res.status(404).json({
          type: 'Unauthorized',
          message: 'Token does not exist'
        });  // Return error if the token does not exist in the database
      }

      // Verify and decode the refresh token using the refresh token secret
      const userData = jwt.verify(token.refreshToken, process.env.REFRESH_TOKEN_SECRET);

      // Find the user in the database based on the user ID from the decoded token
      const user = await User.findById(userData.id);  // Query fixed to use user ID
      if (!user) {
        return res.status(404).json({
          message: 'Invalid user!'
        });  // Return error if the user is invalid or not found
      }

      // Generate a new access token for the user, valid for 24 hours
      const newAccessToken = jwt.sign(
        { id: user.id, isAdmin: user.isAdmin },
        process.env.ACCESS_TOKEN_SECRET,
        { expiresIn: '24h' }  // Access token expiration set to 24 hours
      );

      // Replace the old access token in the Authorization header
      req.headers['authorization'] = `Bearer ${newAccessToken}`;

      // Update the token entry in the database with the new access token
      await Token.updateOne(
        { _id: token.id },  // Find the token by ID
        { accessToken: newAccessToken }  // Update the access token
      ).exec();

      // Send the new Authorization header back to the client
      res.set('Authorization', `Bearer ${newAccessToken}`);
      
      // Call the next middleware or route handler
      return next();
    } catch (refreshError) {
      // If any error occurs during refresh, send an unauthorized response
      return res.status(401).json({
        type: 'Unauthorized',
        message: refreshError.message
      });
    }
  }
  
  // For any other errors, send a 404 error with the error message
  return res.status(404).json({
    type: error.name,
    message: error.message
  });
}

module.exports = errorHandler;
