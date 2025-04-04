const bodyParser = require('body-parser');  // Import body-parser middleware to parse incoming request bodies in JSON format
const cors = require('cors');  // Import CORS middleware to enable Cross-Origin Resource Sharing
const express = require('express');  // Import Express framework to create a web server
const morgan = require('morgan');  // Import Morgan middleware to log HTTP requests in the console
const mongoose = require('mongoose');  // Import Mongoose for MongoDB object modeling and database connection
require('dotenv/config');  // Load environment variables from a .env file into process.env
const authJwt = require('./middlewares/jwt');  // Import custom JWT authentication middleware
const errorHandler = require('./middlewares/error_handler'); // Import error handler middleware
const authorizePostRequest = require('./middlewares/authorization');  // Add this line

const app = express();  // Initialize an Express application
const env = process.env;  // Alias for process.env to easily access environment variables
const API = env.API_URL;  // Define the base API URL from the environment variables


// Middleware Setup
app.use(bodyParser.json());  // Use body-parser to parse JSON bodies from incoming requests
app.use(express.json());
app.use(morgan('tiny'));  // Use Morgan to log incoming HTTP requests in a concise format (tiny)
app.use(cors());  // Enable CORS for all routes
app.options('*', cors());  // Handle preflight CORS requests for all routes
app.use(authJwt());  // Use the JWT authentication middleware for protected routes
app.use(authorizePostRequest);  // Make sure this line exists
app.use(errorHandler);

// Route Setup
const authRouter = require('./routes/auth');  // Import authentication routes
const usersRouter = require('./routes/users'); //Import users routes
const adminRouter = require('./routes/admin'); // Import admin routes
const categoriesRouter = require('./routes/categories');// Import category routes
const productsRouter = require('./routes/products');
const checkoutRouter = require('./routes/checkout');  // Import checkout routes
const ordersRouter = require('./routes/orders');  // Import orders routes




app.use(`${API}/`, authRouter);  // Mount the authentication routes at the base API URL (e.g., /api/v1/)
app.use(`${API}/users`, usersRouter);
app.use(`${API}/admin`, adminRouter);
app.use(`${API}/categories`,categoriesRouter);
app.use(`${API}/products`,productsRouter);
app.use(`${API}/checkout`, checkoutRouter);  // Mount the checkout routes at /api/v1/checkout
app.use(`${API}/orders`, ordersRouter);  // Mount the orders routes at /api/v1/orders
app.use('/public', express.static(__dirname + '/public'));


// Start server configuration
const hostname = env.HOST;  // Get the server hostname from environment variables
const port = env.PORT;  // Get the server port from environment variables
require('./helpers/cron_jobs');

// MongoDB Connection
mongoose
  .connect(env.MONGODB_CONNECTION_STRING)  // Connect to MongoDB using the connection string from the environment variables
  .then(() => {
    console.log('Connected to database');  // Log a message when successfully connected to the database
  })
  .catch((error) => {
    console.error('Error connecting to database:', error);  // Log an error message if the connection fails
  });

// Start the Express server
app.listen(port, hostname, () => {
  console.log(`Server running at http://${hostname}:${port}`);  // Log a message with the URL where the server is running
});
