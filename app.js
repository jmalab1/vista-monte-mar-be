const express = require("express");
const nodemailer = require("nodemailer");
const cors = require("cors");
const bodyParser = require("body-parser");
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { Pool } = require("pg");

const app = express();
const PORT = 8135;

const emailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 3,
  standardHeaders: 'draft-8', // draft-6: `RateLimit-*` headers; draft-7 & draft-8: combined `RateLimit` header
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers.
  message: "The limit to sending a message has been reached. Please try again later."
});

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Middleware for logging requests
app.use(morgan('combined')); // Use 'combined' format for logging

const dbPool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME || "visitor_analytics",
  user: process.env.DB_USER || "visitor_user",
  password: process.env.DB_PASSWORD || "change-me",
});

async function initializeDatabase() {
  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS visitors (
      id BIGSERIAL PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      path TEXT NOT NULL,
      referrer TEXT,
      user_agent TEXT,
      ip TEXT
    );
  `);

  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS form_submissions (
      id BIGSERIAL PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      firstname TEXT NOT NULL,
      lastname TEXT NOT NULL,
      email TEXT NOT NULL,
      phone_number TEXT,
      comment TEXT NOT NULL,
      referrer TEXT,
      user_agent TEXT,
      ip TEXT,
      email_sent BOOLEAN NOT NULL DEFAULT FALSE,
      email_error TEXT
    );
  `);
}

function getClientIp(req) {
  const forwardedFor = req.headers["x-forwarded-for"];
  if (typeof forwardedFor === "string" && forwardedFor.trim()) {
    return forwardedFor.split(",")[0].trim();
  }
  return req.ip || "";
}

function normalizeBody(body) {
  return {
    firstname: String(body.firstname || "").trim(),
    lastname: String(body.lastname || "").trim(),
    email: String(body.email || "").trim(),
    phone_number: String(body.phone_number || "").trim(),
    comment: String(body.comment || "").trim(),
  };
}

function validateSubmission(payload) {
  return payload.firstname && payload.lastname && payload.email && payload.comment;
}

function normalizeTrackedPath(pathValue) {
  const path = String(pathValue || "").trim();
  if (!path) return "/";
  if (path.startsWith("/")) return path;
  return `/${path}`;
}

// Create a Nodemailer transporter
const hasSmtpConfig = Boolean(process.env.SMTP_USER && process.env.SMTP_PASS && process.env.SEND_TO);
const transporter = hasSmtpConfig
  ? nodemailer.createTransport({
      host: "smtp.zoho.com",
      port: 587,
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    })
  : nodemailer.createTransport({ jsonTransport: true });

app.post("/api/track-visitor", async (req, res) => {
  const trackedPath = normalizeTrackedPath(req.body?.path || req.headers["x-page-path"] || "/");
  const referrer = String(req.body?.referrer || req.headers.referer || req.headers.referrer || "").trim();
  const userAgent = String(req.headers["user-agent"] || "").trim();
  const ipAddress = getClientIp(req);

  try {
    const result = await dbPool.query(
      `
        INSERT INTO visitors (path, referrer, user_agent, ip)
        VALUES ($1, $2, $3, $4)
        RETURNING id;
      `,
      [trackedPath, referrer || null, userAgent || null, ipAddress || null]
    );

    return res.status(201).send({ tracked: true, visitorId: result.rows[0].id });
  } catch (dbError) {
    console.error("Failed to save visitor:", dbError);
    return res.status(500).send({ tracked: false, error: "Unable to save visitor." });
  }
});

// Email sending endpoint
app.post("/api/send-email", emailLimiter, async (req, res) => {
  const { firstname, lastname, email, phone_number, comment } = normalizeBody(req.body || {});

  if (!validateSubmission({ firstname, lastname, email, comment })) {
    return res.status(400).send({
      error: "Missing required fields. Required: firstname, lastname, email, comment.",
    });
  }

  const fullname = `${firstname} ${lastname}`.trim();
  const referrer = String(req.headers.referer || req.headers.referrer || "");
  const userAgent = String(req.headers["user-agent"] || "");
  const ipAddress = getClientIp(req);

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
    from: process.env.SMTP_USER || "no-reply@localhost",
    to: process.env.SEND_TO || "local@localhost",
    subject: `Message from ${fullname}`,
    html: htmlBody,
  };

  let submissionId;
  try {
    const insertResult = await dbPool.query(
      `
        INSERT INTO form_submissions
          (firstname, lastname, email, phone_number, comment, referrer, user_agent, ip)
        VALUES
          ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id;
      `,
      [
        firstname,
        lastname,
        email,
        phone_number || null,
        comment,
        referrer || null,
        userAgent || null,
        ipAddress || null,
      ]
    );
    submissionId = insertResult.rows[0].id;
  } catch (dbError) {
    console.error("Failed to save form submission:", dbError);
    return res.status(500).send({ error: "Unable to save form submission." });
  }

  try {
    const info = await transporter.sendMail(mailOptions);
    await dbPool.query(
      "UPDATE form_submissions SET email_sent = TRUE, email_error = NULL WHERE id = $1",
      [submissionId]
    );
    return res.status(200).send({
      message: hasSmtpConfig ? "Email sent successfully and submission saved." : "Submission saved (email running in local mock mode).",
      submissionId,
      info,
    });
  } catch (mailError) {
    await dbPool.query(
      "UPDATE form_submissions SET email_sent = FALSE, email_error = $2 WHERE id = $1",
      [submissionId, String(mailError)]
    );
    return res.status(502).send({
      error: "Submission was saved, but sending email failed.",
      submissionId,
      details: String(mailError),
    });
  }
});

initializeDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Failed to initialize database:", err);
    process.exit(1);
  });
