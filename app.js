const express = require("express");
const nodemailer = require("nodemailer");
const cors = require("cors");
const bodyParser = require("body-parser");
const morgan = require('morgan');

const app = express();
const PORT = 8135;

// Middleware
app.use(cors());
app.use(bodyParser.json());

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
  const { subject, text } = req.body;

  let mailOptions = {
    from: process.env.SMTP_USER, // Replace with your email
    to: "malabanan1@verizon.net",
    subject: subject,
    text: text,
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
