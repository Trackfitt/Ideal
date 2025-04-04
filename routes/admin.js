
const express = require('express');
const router = express.Router();

const usersControllers = require('../controllers/admin/users');
const categoriesControllers = require('../controllers/admin/categories');
const ordersControllers = require('../controllers/admin/orders');
const productControllers = require('../controllers/admin/product');

//Users
router.get('/users/count',usersControllers.getUserCount);
router.delete('/users/:id',usersControllers.deleteUser);
//Categories
router.post('/categories',categoriesControllers.addCategory);
router.put('/categories/:id',categoriesControllers.editCategory);
router.delete('/categories/:id',categoriesControllers.deleteCategory);

//Products
router.get('/products/count',productControllers.getProductsCount);
router.get('/products',productControllers.getProducts);
router.post('/products', productControllers.addProduct);
router.put('/products/:id',productControllers.editProduct);
router.delete('/products/:id/images',productControllers.deleteProductImages);
router.delete('/products/:id',productControllers.deleteProduct);


//Orders
router.get('/orders', ordersControllers.getOrders);
router.get('/orders/count',ordersControllers.getOrdersCount);
router.put('/orders/:id', ordersControllers.changeOrdersStatus);
router.delete('/orders/:id', ordersControllers.deleteOrder);

module.exports = router;
