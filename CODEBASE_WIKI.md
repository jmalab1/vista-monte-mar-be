# Vista Monte Mar Backend Wiki

_Last updated: 2026-04-28_

## Purpose

Node/Express API for auth, visitor analytics, inventory/checklist management, and contact submission email delivery.

Stack:
- Node.js
- Express
- Nodemailer
- PostgreSQL (`pg`)
- Vitest + Supertest

## Runtime Entry Points

- `app.js`: startup/bootstrap only (database initialization + `listen`)
- `src/app.js`: express app composition and route mounting

## Reorganized Layout

- `src/config/env.js`: environment config
- `src/middleware/`: auth + visitor tracking middleware
- `src/routes/authRoutes.js`: login + token verification
- `src/routes/visitorRoutes.js`: visitor history endpoints
- `src/routes/inventoryRoutes.js`: inventory listing/data endpoints
- `src/routes/checklistRoutes.js`: checklist listing/data endpoints
- `src/routes/contactRoutes.js`: `/api/send-email` endpoint + rate limiter
- `src/services/database.js`: shared Postgres pool
- `src/services/kvService.js`: app_kv defaults and JSON helpers
- `src/services/submissionService.js`: submission normalization, validation, persistence helpers
- `src/services/mailService.js`: nodemailer transport + contact mail send
- `tests/integration/`: route integration tests
- `tests/unit/`: unit tests

## Contact Endpoint Semantics

Endpoint:
- `POST /api/send-email`

Validation/behavior:
- Requires `firstname`, `lastname`, `email`, `comment`
- Returns `400` with unchanged missing-field error when required fields are absent
- Saves to `form_submissions` before mail attempt
- Returns `500` if DB save fails
- Returns `200` on successful send with:
  - SMTP configured: `Email sent successfully and submission saved.`
  - local/mock mode: `Submission saved (email running in local mock mode).`
- Returns `502` if save succeeds but email send fails

Rate limiting:
- `express-rate-limit`
- 3 requests per IP per 15 minutes
- Same limit message: `The limit to sending a message has been reached. Please try again later.`

## Required Environment Variables

- `SMTP_USER`
- `SMTP_PASS`
- `SEND_TO`

Database defaults:
- `DB_HOST`
- `DB_PORT`
- `DB_NAME`
- `DB_USER`
- `DB_PASSWORD`

## Local Dev

```bash
cd C:\Users\malab\Documents\dev\vista-monte-mar-be
npm install
npm test
npm start
```
