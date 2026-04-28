const nodemailer = require('nodemailer');
const env = require('../config/env');

const hasSmtpConfig = Boolean(env.SMTP_USER && env.SMTP_PASS && env.SEND_TO);

const transporter = hasSmtpConfig
  ? nodemailer.createTransport({
      host: 'smtp.zoho.com',
      port: 587,
      secure: false,
      auth: {
        user: env.SMTP_USER,
        pass: env.SMTP_PASS,
      },
    })
  : nodemailer.createTransport({ jsonTransport: true });

function buildMailOptions(payload) {
  const fullname = `${payload.firstname} ${payload.lastname}`.trim();
  const htmlBody = `
    <html>
      <body>
        <h1>Hello!</h1>
        <p>You have received a comment from ${fullname}.</p>
        <p>Email: ${payload.email}</p>
        <p>Phone Number: ${payload.phone_number}</p>
        <p>Comment: ${payload.comment}</p>
      </body>
    </html>
  `;

  return {
    from: env.SMTP_USER || 'no-reply@localhost',
    to: env.SEND_TO || 'local@localhost',
    subject: `Message from ${fullname}`,
    html: htmlBody,
  };
}

async function sendContactEmail(payload) {
  return transporter.sendMail(buildMailOptions(payload));
}

module.exports = {
  hasSmtpConfig,
  sendContactEmail,
};
