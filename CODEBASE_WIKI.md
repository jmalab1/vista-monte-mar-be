# Vista Monte Mar Backend Wiki

_Last updated: 2026-04-25_

## Purpose

Node/Express API used by the frontend contact workflow to send emails.

Stack:
- Node.js
- Express
- Nodemailer
- PostgreSQL (`pg`)

## Key Structure

- `app.js`: entire API service and mail handling
- `package.json`: start script and dependencies
- `Dockerfile`: container build
- `pushToDocker.sh`, `pushToDockerDev.sh`: image publishing scripts

## Service Behavior

Port:
- `8135`

Endpoint:
- `POST /api/send-email`

Submission handling:
- Saves each form submission to Postgres table `form_submissions`
- Attempts email delivery after DB save
- In local mode (without SMTP env vars), uses Nodemailer JSON transport mock

Body fields used:
- `firstname`
- `lastname`
- `email`
- `phone_number`
- `comment`

Middleware:
- `cors`
- `bodyParser.json`
- `morgan` logging
- `express-rate-limit` (3 requests per 15 minutes per IP)

SMTP:
- host: `smtp.zoho.com`
- port: `587`
- auth via env vars

## Required Environment Variables

- `SMTP_USER`
- `SMTP_PASS`
- `SEND_TO`

When deployed via the Helm services repo with Postgres enabled, the backend also receives:
- `DB_HOST`
- `DB_PORT`
- `DB_NAME`
- `DB_USER`
- `DB_PASSWORD`

## Local Dev

```bash
cd C:\Users\malab\Documents\dev\vista-monte-mar-be
npm install
$env:SMTP_USER="..."
$env:SMTP_PASS="..."
$env:SEND_TO="..."
npm start
```

## Docker Notes

- `pushToDocker.sh` -> `jmalab24/vista-monte-mar-be:latest`
- `pushToDockerDev.sh` -> `jmalab24/vista-monte-mar-be:dev`
- Exposes container port `8135`

## First Files To Open

1. `app.js`
2. `package.json`
3. `Dockerfile`
