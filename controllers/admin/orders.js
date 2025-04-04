const { populate } = require('dotenv');
const {Order} = require('../../models/order');
const { OrderItem } = require('../../models/order_item');

exports.getOrders = async function (req, res) {
    try{
        const orders = await Order.find()
        .select('-statusHistory')
        .populate('user', 'name email')
        .sort({dateOrdered: -1})
        .populate({
            path: 'orderItems',
            populate:{
                path: 'product',
                select: 'name',
                populate: {path: 'category', select: 'name'},
            },
        });
        if (!orders) {
            return res.status(404). json({message: 'Order not found'});
        }
        return res.json(orders);
    }catch (error) {
        console.error(error); // Log errors to the console
        return res.status(500).json({ type: error.name, message: error.message }); // Handle any errors
    }
};

exports.getOrdersCount = async function (_, res) {
    try{
        const count = await Order.countDocuments();
        if(!count) {
            return res.status(500).json({message: 'Could not count orders!'});
        }
        return res.json({ count });
    }catch (error) {
        console.error(error); // Log errors to the console
        return res.status(500).json({ type: error.name, message: error.message }); // Handle any errors
    }
};

exports.changeOrdersStatus = async function (req, res) {
    try{
        const orderId = req.params.id;
        const newStatus = req.body.status;

        let order = await Order.findbyId(orderId);
        if(!order){
            return res.status(400).json({message: 'Order not found'});
        }
        if(!order,statusHistory.includes(order.status)){
            order.statusHistory.push(order.status);
        }
        order.status = newStatus;
        order = await order.save();
        return res.json(order);
    }catch (error) {
        console.error(error); // Log errors to the console
        return res.status(500).json({ type: error.name, message: error.message }); // Handle any errors
    }
};

exports.deleteOrder = async function (req, res) {
    try{
        const order = await findByIdAndDelete(req.params.id);
        if(!order) {
            return res.status(404).json({message: 'Order not found'});
        }
        for (const orderitemid of order.orderitems) {
            await OrderItem.findByIdAndDelete(orderItemId);
        }
        return res.status(204).end();
    }catch (error) {
        console.error(error); // Log errors to the console
        return res.status(500).json({ type: error.name, message: error.message }); // Handle any errors
    }
};