const nodemailer = require('nodemailer'); // Import nodemailer to send emails

// Export an async function to send an email
exports.sendmail = async (email, subject, body) => {
    return new Promise((resolve, reject) => { // Return a promise to handle success and error cases
        const transporter = nodemailer.createTransport({
            service: 'gmail', // Use Gmail as the email service provider
            auth: {
                user: process.env.EMAIL,  // Your email address (stored in environment variable)
                pass: process.env.EMAIL_PASS  // Your email password (stored in environment variable)
            }
        });

        // Define the email options
        const mailOptions = {
            from: process.env.EMAIL, // The sender's email address (from your environment variables)
            to: email, // The recipient's email address (passed as a parameter)
            subject: subject, // The email subject (passed as a parameter)
            text: body // The email body content (passed as a parameter)
        };

        // Send the email using nodemailer
        transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
                console.error('Error sending email:', error); // Log the error if email sending fails
                reject(Error('Error sending email')); // Reject the promise with an error message
            }
            console.log('Email sent:', info.response); // Log the response info if email was sent successfully
            resolve('Password reset OTP has been sent to your email'); // Resolve the promise with a success message
        });
    });
};
