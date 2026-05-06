# MailTrack SaaS — Production-Ready Email Tracking

GDPR-compliant email tracking system (Mailtrack / MailSuite style).
Built with Node.js, PostgreSQL, Redis, Chrome Extension MV3, and a vanilla JS dashboard.

---

## Architecture

```
mailtrack-saas/
├── backend/                    Node.js + Express API
│   ├── src/
│   │   ├── index.js            Entry point
│   │   ├── routes/             auth, email, tracking, settings, notifications
│   │   ├── services/           trackingService, emailService, gmailService,
│   │   │                       notificationService, webhookService
│   │   ├── middleware/         auth (JWT), rateLimiter, errorHandler
│   │   ├── models/             migrate.js (PostgreSQL schema)
│   │   └── utils/              db, redis, logger, audit
│   ├── .env.example
│   └── package.json
├── chrome-extension/           Manifest V3 Chrome Extension
│   ├── manifest.json
│   └── src/
│       ├── background/         service-worker.js (SSE + notifications)
│       ├── content/            gmail-injector.js + gmail-styles.css
│       └── popup/              popup.html + popup.js
├── frontend/
│   └── index.html              Dashboard (vanilla JS, no build step)
└── docs/
    └── gmail-api-setup.md
```

---

## Quick Start

### 1. Prerequisites
- Node.js >= 18
- PostgreSQL >= 14
- Redis >= 7

### 2. Backend Setup

```bash
cd backend
cp .env.example .env
# Fill in DATABASE_URL, REDIS_URL, JWT_SECRET, Google OAuth2 credentials

npm install
node src/models/migrate.js    # Run DB migrations
npm run dev                   # Start dev server on :3001
```

### 3. Frontend Setup

Open `frontend/index.html` in a browser — no build step needed.
Update `const API = 'https://your-backend.com'` to your backend URL.

### 4. Chrome Extension

1. Open Chrome → `chrome://extensions`
2. Enable "Developer mode"
3. "Load unpacked" → select the `chrome-extension/` folder
4. Update `API_BASE` in `src/background/service-worker.js`
5. Update `client_id` in `manifest.json` with your Google Client ID

---

## API Reference

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/register` | — | Create account |
| POST | `/auth/login` | — | Get JWT token |
| GET | `/auth/google` | — | OAuth2 redirect |
| GET | `/auth/me` | JWT | Current user |
| POST | `/email/create` | JWT | Create tracking record |
| POST | `/email/send` | JWT | Send via Gmail API |
| GET | `/email/list` | JWT | List tracked emails |
| GET | `/email/:id/stats` | JWT | Opens + clicks detail |
| DELETE | `/email/:id` | JWT | Delete tracked email |
| GET | `/track/open/:id` | — | 1×1 tracking pixel |
| GET | `/track/click/:id` | — | Click redirect |
| GET | `/user/settings` | JWT | Get settings |
| POST | `/user/settings` | JWT | Update settings |
| GET | `/user/settings/gdpr/export` | JWT | Download all data |
| DELETE | `/user/settings/gdpr/delete` | JWT | Delete account |
| GET | `/notifications/stream` | JWT | SSE real-time stream |

---

## GDPR Compliance

| Measure | Implementation |
|---------|---------------|
| Opt-in only | `tracking_enabled = false` by default |
| IP anonymization | Last IPv4 octet zeroed (1.2.3.4 → 1.2.3.0), on by default |
| Per-email opt-out | `tracking_enabled` flag per email record |
| Data export | `GET /user/settings/gdpr/export` |
| Data deletion | `DELETE /user/settings/gdpr/delete` (cascades all records) |
| Audit log | Every data access action logged to `audit_log` table |
| Data retention | Configurable (default 365 days) |
| No fingerprinting | Only timestamp, anonymized IP, UA, country |
| No email body storage | Gmail API used for send only; body never persisted |
| Minimum scopes | `gmail.compose` only (not `gmail.readonly`) |

---

## Security Measures

- **Open redirect prevention** — click URLs validated with `new URL()`, only `http/https` allowed
- **Bot filtering** — common bot UAs ignored in tracking
- **Rate limiting** — API: 100 req/15min, tracking: 500 req/min, auth: 10 req/15min
- **Helmet** — security headers on all responses
- **JWT** — stateless auth, 7-day expiry
- **Input validation** — URLs validated with `validator.js`
- **HMAC webhooks** — SHA-256 signed payloads
- **Parameterized queries** — no SQL injection risk
- **CORS** — strict allowlist (frontend URL + extension origin)

---

## Webhook Payload Example

```json
{
  "event": "email.opened",
  "data": {
    "type": "email.opened",
    "emailId": "uuid",
    "userId": "uuid",
    "country": "IT",
    "device_type": "desktop",
    "browser": "Chrome",
    "occurred_at": "2026-05-06T14:30:00Z"
  },
  "ts": "2026-05-06T14:30:00Z"
}
```

Verify with header `X-MailTrack-Sig: sha256=<hmac>`.

---

## Production Checklist

- [ ] Set strong `JWT_SECRET` (32+ random bytes)
- [ ] Enable HTTPS / TLS on backend
- [ ] Encrypt `google_tokens` in DB (AES-256)
- [ ] Set `NODE_ENV=production`
- [ ] Configure PostgreSQL connection pooling (PgBouncer)
- [ ] Set up Redis persistence (AOF)
- [ ] Add privacy policy page at `/privacy`
- [ ] Run a cron job to delete events older than `data_retention_days`
- [ ] Replace `console.error` audit fallback with a proper alerting system
- [ ] Review Google API Services User Data Policy compliance before publishing extension
