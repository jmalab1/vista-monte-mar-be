const express = require("express");
const nodemailer = require("nodemailer");
const cors = require("cors");
const bodyParser = require("body-parser");
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = 8135;

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 3, // Limit each IP to 100 requests per `window` (here, per 15 minutes).
  standardHeaders: 'draft-8', // draft-6: `RateLimit-*` headers; draft-7 & draft-8: combined `RateLimit` header
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers.
  messsage: "The limit to sending a message has been reached. Please Try again later."
});

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(limiter);

// Middleware for logging requests
app.use(morgan('combined')); // Use 'combined' format for logging

// Create a Nodemailer transporter
let transporter = nodemailer.createTransport({
  host: "smtp.zoho.com", // Replace with your SMTP server
  port: 587,
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER, // your SMTP username
    pass: process.env.SMTP_PASS, // your SMTP password
  },
});

// Email sending endpoint
app.post("/api/send-email", (req, res) => {
  const { firstname, lastname, email, phone_number, comment } = req.body;
  const fullname = `${firstname} ${lastname}`.trim();

  const htmlBody = `
    <html>
      <body>
        <h1>Hello!</h1>
        <p>You have received a comment from ${fullname}.</p>
        <p>Email: ${email}</p>
        <p>Phone Number: ${phone_number}</p>
        <p>Comment: ${comment}</p>
      </body>
    </html>
  `;

  let mailOptions = {
    from: process.env.SMTP_USER, // Replace with your email
    to: process.env.SEND_TO,
    subject: `Message from ${fullname}`,
    html: htmlBody,
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      return res.status(500).send({ error: error.toString() });
    }
    res.status(200).send({ message: "Email sent successfully!", info });
  });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
