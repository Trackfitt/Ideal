const { User } = require("../models/user");

// Fetch all users
exports.getUsers = async (_, res) => {
    try{
        const users = await User.find().select('name email id isAdmin');
        if(!users) {
            return res.status(404).json({ message: 'No users found' });
        }
        return res.json(users);
    } catch (error) {
        console.error(error);
        return res.status(500).json({ type: error.name, message: error.message });
    }
};

// Fetch a user by their ID
exports.getUserById = async (req, res) => {
    try {
        const user = await User.findById(req.params.id).select(
            '-passwordHash -resetPasswordOtp -resetPasswordOtpExpires -cart'
        );
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        return res.json(user);
    } catch (error) {
        console.error(error);
        return res.status(500).json({ type: error.name, message: error.message });
    }
};

// Update user details (this is currently empty, define the logic as needed)
exports.updateUser = async (req, res) => {
  try{
    const {name, email, phone,} = req.body;
    const user = await User.findByIdAndUpdate(
        req.params.id,
        {name, email, phone},
        {new: true}
    );
    if(!user) {
        return res.status(404).json({message: 'User not found'})
    }
    user.cart = undefined;
    user.passwordHash = undefined;
  }catch (error) {
        console.error(error);
        return res.status(500).json({ type: error.name, message: error.message });
    }
};
