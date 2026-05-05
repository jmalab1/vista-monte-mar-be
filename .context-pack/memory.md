# Learned Repo Memory

## Memory Metadata
- created_at_unix: 1777953218
- created_at_utc: 2026-05-05T03:53:38Z
- refreshed_at_unix: 1777953218
- refreshed_at_utc: 2026-05-05T03:53:38Z
- refresh_policy: Refresh this file if it is older than 7 days and repo development has continued.

## Repo
- name: vista-monte-mar-be
- purpose: Express backend for Vista Monte Mar APIs.
- project types: node, express
- primary languages: javascript
- active branch: v2

## Read First
- `AGENTS.md`: repo instruction to run context-pack and read this memory before edits.
- `package.json`: scripts and dependencies.
- `app.js`: server bootstrap and route registration.
- `src/routes`: API route modules.
- `src/services`: business logic and database-facing service modules.

## Entry Points
- `app.js`: main Express server entrypoint.
- `src/middleware/auth.js`: auth guard used by protected admin/version/audit routes.
- `src/routes/contactRoutes.js`: contact form submission API.
- `src/routes/auditRoutes.js`: audit event list API.
- `src/routes/versionRoutes.js`: version list/restore API.

## Hotspots
- Audit/version work spans `src/routes/auditRoutes.js`, `src/routes/versionRoutes.js`, `src/services/auditService.js`, and `src/services/versionService.js`.
- Security/rate-limit logic lives in `src/services/securityService.js`.
- Payload validation lives in `src/services/validationService.js`.
- Contact form persistence/email behavior lives in `src/services/submissionService.js` and `src/routes/contactRoutes.js`.
- Integration tests live under `tests/integration`.

## Known Pitfalls
- Windows file-mode noise has happened in this workspace; repo config should keep `core.filemode=false`.
- Context-pack memory should be used as orientation only; verify against current code before editing.
- Keep backend response shapes aligned with frontend admin pages, especially email history/contact submission endpoints.

## Operational Notes
- Test command: `npm test`.
- Start command: `npm start`.
- Runtime dependencies include Express, CORS, rate limiting, Nodemailer, and Postgres `pg`.
- Dev/test stack uses Vitest and Supertest.

## Debugging Notes
- There were local uncommitted backend changes around visitor tracking/contact submission validation when AGENTS.md was added.

## Open Questions
- Confirm final API contract for contact-email-history list/export endpoints against frontend `/email-history`.
