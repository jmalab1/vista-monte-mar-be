const express = require("express");
const nodemailer = require("nodemailer");
const cors = require("cors");
const bodyParser = require("body-parser");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const crypto = require("crypto");
const { Pool } = require("pg");

const app = express();
const PORT = 8135;
const TOKEN_TTL_SECONDS = Number(process.env.TOKEN_TTL_SECONDS || 60 * 60 * 12);
const AUTH_SECRET = process.env.AUTH_SECRET || "change-this-local-auth-secret";
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";

const DEFAULT_INVENTORY_LISTING = {
  kitchen: {
    name: "Kitchen",
    fields: {
      paper_towels: { type: "number", name: "Paper Towels" },
      trash_bags: { type: "number", name: "Trash Bags" },
      notes: { type: "textarea", name: "Notes" },
    },
  },
  bathrooms: {
    name: "Bathrooms",
    fields: {
      toilet_paper: { type: "number", name: "Toilet Paper" },
      hand_soap: { type: "number", name: "Hand Soap" },
      towels_ok: { type: "toggle", name: "Towels Restocked" },
    },
  },
};

const DEFAULT_CHECKLIST_LISTING = {
  lights: { name: "Turn off all lights", fields: {} },
  doors: { name: "Lock all doors", fields: {} },
  ac: { name: "Set AC to checkout setting", fields: {} },
};

const emailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 3,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: "The limit to sending a message has been reached. Please try again later.",
});

app.use(cors());
app.use(bodyParser.json());
app.use(morgan("combined"));

const dbPool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME || "visitor_analytics",
  user: process.env.DB_USER || "visitor_user",
  password: process.env.DB_PASSWORD || "change-me",
});

function toBase64Url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromBase64Url(input) {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padLength = (4 - (normalized.length % 4)) % 4;
  return Buffer.from(normalized + "=".repeat(padLength), "base64").toString("utf8");
}

function safeEqual(a, b) {
  const bufferA = Buffer.from(String(a));
  const bufferB = Buffer.from(String(b));
  if (bufferA.length !== bufferB.length) {
    return false;
  }
  return crypto.timingSafeEqual(bufferA, bufferB);
}

function createToken(subject) {
  const header = toBase64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = toBase64Url(
    JSON.stringify({
      sub: subject,
      exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS,
      iat: Math.floor(Date.now() / 1000),
    })
  );
  const signature = toBase64Url(
    crypto.createHmac("sha256", AUTH_SECRET).update(`${header}.${payload}`).digest()
  );
  return `${header}.${payload}.${signature}`;
}

function verifyToken(token) {
  if (!token || typeof token !== "string") {
    return null;
  }
  const parts = token.split(".");
  if (parts.length !== 3) {
    return null;
  }

  const [header, payload, signature] = parts;
  const expectedSignature = toBase64Url(
    crypto.createHmac("sha256", AUTH_SECRET).update(`${header}.${payload}`).digest()
  );

  if (!safeEqual(signature, expectedSignature)) {
    return null;
  }

  try {
    const decoded = JSON.parse(fromBase64Url(payload));
    if (!decoded.exp || Number(decoded.exp) < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}

function getTokenFromRequest(req) {
  const headerToken = req.headers["x-access-token"];
  if (typeof headerToken === "string" && headerToken.trim()) {
    return headerToken.trim();
  }

  const authorization = req.headers.authorization;
  if (typeof authorization === "string" && authorization.startsWith("Bearer ")) {
    return authorization.slice(7).trim();
  }

  return "";
}

function requireAuth(req, res, next) {
  const token = getTokenFromRequest(req);
  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(401).send({ error: "Unauthorized" });
  }
  req.auth = decoded;
  return next();
}

function requireAdmin(req, res, next) {
  const token = getTokenFromRequest(req);
  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(401).send({ error: "Unauthorized" });
  }

  if (String(decoded.sub || "") !== ADMIN_USERNAME) {
    return res.status(403).send({ error: "Forbidden" });
  }

  req.auth = decoded;
  return next();
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getInventoryDefaults(listing) {
  const defaults = {};
  Object.entries(listing || {}).forEach(([parentKey, section]) => {
    const fields = isPlainObject(section?.fields) ? section.fields : {};
    defaults[parentKey] = {};
    Object.entries(fields).forEach(([fieldKey, field]) => {
      switch (field?.type) {
        case "number":
          defaults[parentKey][fieldKey] = "0";
          break;
        case "toggle":
          defaults[parentKey][fieldKey] = false;
          break;
        default:
          defaults[parentKey][fieldKey] = "";
          break;
      }
    });
  });
  return defaults;
}

function getChecklistDefaults(listing) {
  const defaults = {};
  Object.keys(listing || {}).forEach((key) => {
    defaults[key] = false;
  });
  return defaults;
}

async function getJsonValue(key, fallbackValue) {
  const result = await dbPool.query("SELECT value FROM app_kv WHERE key = $1", [key]);
  if (!result.rows.length) {
    return fallbackValue;
  }
  return result.rows[0].value;
}

async function setJsonValue(key, value) {
  await dbPool.query(
    `
      INSERT INTO app_kv (key, value, updated_at)
      VALUES ($1, $2::jsonb, NOW())
      ON CONFLICT (key)
      DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    `,
    [key, JSON.stringify(value)]
  );
}

async function setJsonDefault(key, value) {
  await dbPool.query(
    `
      INSERT INTO app_kv (key, value)
      VALUES ($1, $2::jsonb)
      ON CONFLICT (key) DO NOTHING
    `,
    [key, JSON.stringify(value)]
  );
}

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

  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS app_kv (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await setJsonDefault("inventory_listing", DEFAULT_INVENTORY_LISTING);
  await setJsonDefault("checklist_listing", DEFAULT_CHECKLIST_LISTING);
  await setJsonDefault(
    "inventory_data",
    getInventoryDefaults(DEFAULT_INVENTORY_LISTING)
  );
  await setJsonDefault(
    "checklist_data",
    getChecklistDefaults(DEFAULT_CHECKLIST_LISTING)
  );
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

function deriveTrackedPathFromRequest(req) {
  const explicitPath = String(req.headers["x-page-path"] || req.body?.path || "").trim();
  if (explicitPath) {
    return normalizeTrackedPath(explicitPath);
  }

  const referer = String(req.headers.referer || req.headers.referrer || "").trim();
  if (!referer) {
    return "/";
  }

  try {
    const parsed = new URL(referer);
    return normalizeTrackedPath(parsed.pathname || "/");
  } catch {
    return "/";
  }
}

async function saveVisitorEvent(req, trackedPathOverride) {
  const trackedPath = normalizeTrackedPath(trackedPathOverride || deriveTrackedPathFromRequest(req));
  const referrer = String(req.headers.referer || req.headers.referrer || req.body?.referrer || "").trim();
  const userAgent = String(req.headers["user-agent"] || "").trim();
  const ipAddress = getClientIp(req);

  const result = await dbPool.query(
    `
      INSERT INTO visitors (path, referrer, user_agent, ip)
      VALUES ($1, $2, $3, $4)
      RETURNING id;
    `,
    [trackedPath, referrer || null, userAgent || null, ipAddress || null]
  );

  return result.rows[0].id;
}

const hasSmtpConfig = Boolean(
  process.env.SMTP_USER && process.env.SMTP_PASS && process.env.SEND_TO
);
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

app.post("/api/login", (req, res) => {
  const username = String(req.body?.username || "").trim();
  const password = String(req.body?.password || "");

  if (!safeEqual(username, ADMIN_USERNAME) || !safeEqual(password, ADMIN_PASSWORD)) {
    return res.status(401).send({ error: "Invalid credentials" });
  }

  return res.status(200).send({ token: createToken(username) });
});

app.get("/api/verify-token", (req, res) => {
  const token = getTokenFromRequest(req);
  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(401).send({ valid: false });
  }
  return res.status(200).send({ valid: true, user: decoded.sub, exp: decoded.exp });
});

app.get("/api/inventory-listing", requireAdmin, async (_req, res) => {
  try {
    const listing = await getJsonValue("inventory_listing", DEFAULT_INVENTORY_LISTING);
    return res.status(200).send(listing);
  } catch (error) {
    return res.status(500).send({ error: "Unable to load inventory listing." });
  }
});

app.post("/api/update-inventory-listing", requireAdmin, async (req, res) => {
  if (!isPlainObject(req.body)) {
    return res.status(400).send({ error: "Inventory listing must be a JSON object." });
  }
  try {
    await setJsonValue("inventory_listing", req.body);
    const currentData = await getJsonValue("inventory_data", {});
    const merged = { ...getInventoryDefaults(req.body), ...currentData };
    await setJsonValue("inventory_data", merged);
    return res.status(200).send({ updated: true });
  } catch {
    return res.status(500).send({ error: "Unable to update inventory listing." });
  }
});

app.get("/api/get-inventory", requireAdmin, async (_req, res) => {
  try {
    const listing = await getJsonValue("inventory_listing", DEFAULT_INVENTORY_LISTING);
    const fallback = getInventoryDefaults(listing);
    const data = await getJsonValue("inventory_data", fallback);
    return res.status(200).send(data);
  } catch {
    return res.status(500).send({ error: "Unable to load inventory data." });
  }
});

app.post("/api/save-inventory", requireAdmin, async (req, res) => {
  if (!isPlainObject(req.body)) {
    return res.status(400).send({ error: "Inventory payload must be a JSON object." });
  }
  try {
    await setJsonValue("inventory_data", req.body);
    return res.status(200).send({ saved: true });
  } catch {
    return res.status(500).send({ error: "Unable to save inventory data." });
  }
});

app.get("/api/checklist-listing", requireAdmin, async (_req, res) => {
  try {
    const listing = await getJsonValue("checklist_listing", DEFAULT_CHECKLIST_LISTING);
    return res.status(200).send(listing);
  } catch {
    return res.status(500).send({ error: "Unable to load checklist listing." });
  }
});

app.post("/api/update-checklist-listing", requireAdmin, async (req, res) => {
  if (!isPlainObject(req.body)) {
    return res.status(400).send({ error: "Checklist listing must be a JSON object." });
  }
  try {
    await setJsonValue("checklist_listing", req.body);
    const currentData = await getJsonValue("checklist_data", {});
    const merged = { ...getChecklistDefaults(req.body), ...currentData };
    await setJsonValue("checklist_data", merged);
    return res.status(200).send({ updated: true });
  } catch {
    return res.status(500).send({ error: "Unable to update checklist listing." });
  }
});

app.get("/api/get-checklist", requireAdmin, async (_req, res) => {
  try {
    const listing = await getJsonValue("checklist_listing", DEFAULT_CHECKLIST_LISTING);
    const fallback = getChecklistDefaults(listing);
    const data = await getJsonValue("checklist_data", fallback);
    return res.status(200).send(data);
  } catch {
    return res.status(500).send({ error: "Unable to load checklist data." });
  }
});

app.post("/api/save-checklist", requireAdmin, async (req, res) => {
  if (!isPlainObject(req.body)) {
    return res.status(400).send({ error: "Checklist payload must be a JSON object." });
  }
  try {
    await setJsonValue("checklist_data", req.body);
    return res.status(200).send({ saved: true });
  } catch {
    return res.status(500).send({ error: "Unable to save checklist data." });
  }
});

app.use("/api", async (req, _res, next) => {
  const method = String(req.method || "").toUpperCase();
  const routePath = String(req.path || "");

  const shouldTrackMethod = method === "GET";
  const excludedPaths = new Set([
    "/login",
    "/verify-token",
    "/track-visitor",
    "/visitor-history",
  ]);

  if (!shouldTrackMethod || excludedPaths.has(routePath)) {
    return next();
  }

  try {
    await saveVisitorEvent(req);
  } catch (error) {
    console.error("Failed to auto-track visitor:", error);
  }

  return next();
});

app.get("/api/visitor-history", requireAdmin, async (_req, res) => {
  try {
    const result = await dbPool.query(
      `
        SELECT created_at, path, referrer, user_agent, ip
        FROM visitors
        ORDER BY created_at DESC
        LIMIT 500;
      `
    );

    const rows = result.rows.map((row) => ({
      createdAt: row.created_at,
      path: row.path,
      referrer: row.referrer,
      userAgent: row.user_agent,
      ip: row.ip,
    }));

    return res.status(200).send(rows);
  } catch (error) {
    console.error("Failed to load visitor history:", error);
    return res.status(500).send({ error: "Unable to load visitor history." });
  }
});

app.post("/api/track-visitor", (_req, res) => {
  return res.status(410).send({
    message: "Deprecated: tracking is now server-side and stored in Postgres.",
  });
});

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

  const mailOptions = {
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
      message: hasSmtpConfig
        ? "Email sent successfully and submission saved."
        : "Submission saved (email running in local mock mode).",
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
