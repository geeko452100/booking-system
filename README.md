# Booking System

A full-stack appointment booking app with a staff dashboard, client self-service portal, account management and
payment records. Built with **React**, **TypeScript** and **Node.js**.

Clients book, cancel and pay for their own appointments. Staff and administrators run the day from one dashboard:
today's schedule, client accounts and sign-in security, payments, and a full activity log.

> **This is a demo project.** Payments run in test mode only: no real money is taken and real card numbers are rejected.

<!-- Screenshots: add images to docs/ and reference them here, e.g. ![Dashboard](docs/dashboard.png) -->

## Features

**For staff and administrators**
- **Dashboard:** today's schedule with one-click Complete / No-show / Reschedule / Cancel, 30-day revenue, a 14-day
  revenue chart, cancellation rate, appointments awaiting payment, and alerts for locked accounts.
- **Client accounts:** search and filter, contact details and internal notes, sign-in history, failed attempts,
  and one-click unlock, password reset and deactivation.
- **Appointments:** grouped by day with quick date filters. Double-booking a client or provider is blocked.
- **Payments:** record payments, filter by date, status and method, export to CSV, and issue refunds (admin only).
- **Services:** name, duration, price, and whether clients can book it.
- **Activity log:** every sign-in, failed attempt, lockout, account change, booking and payment, with who did it and when.

**For clients**
- Self sign-up, booking, cancelling upcoming appointments, and paying online with a test card.
- A home page showing the next appointment, balance due and recent payments.

**Throughout:** light and dark themes that follow the system setting, and a layout that works on phones.

## Quick start

Requires **Node.js 22** (developed on 22.11) and npm.

```bash
git clone <this-repo-url> booking-system
cd booking-system
npm install
npm run dev
```

Open **http://localhost:5173**. The first start creates a SQLite database with demo data. Sign in with:

| Role   | Email                | Password     |
| ------ | -------------------- | ------------ |
| Admin  | `admin@example.com`  | `Admin123!`  |
| Staff  | `sam@example.com`    | `Staff123!`  |
| Client | `client@example.com` | `Client123!` |

To wipe the database and reload fresh demo data at any time, run `npm run seed`.

## Running a public demo

```bash
npm install
npm run demo
```

This builds the app and serves it at **http://localhost:4000** in demo mode, which is designed for sharing a link:

- **Data resets itself** at start-up and every 60 minutes (`DEMO_RESET_MINUTES`), so dates stay current and visitors'
  changes are cleared. A bar on every page says when the next reset is.
- **The demo logins can't be broken.** They never lock after wrong passwords, and their password, email, role and
  status can't be changed, so one visitor can't lock out the next.
- **Everyone is signed out at each reset**, with a message explaining why.
- **One-click sign-in:** the sign-in page has Admin / Staff / Client buttons.
- No secrets to configure.

To put it on the internet, serve it over **HTTPS**, for example behind a reverse proxy or a
[Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/). In production,
sign-in cookies are HTTPS-only, so sign-in won't work over plain `http://` on a public address.

## Test payments

Clients pay from **Payments → Pay online**. A banner on the page lists the test cards:

| Card number           | Result   |
| --------------------- | -------- |
| `4242 4242 4242 4242` | Approved |
| `5555 5555 5555 4444` | Approved |
| `4000 0000 0000 0002` | Declined |

Use any future expiry date (e.g. `12/34`) and any 3-digit CVC. Any other card number is rejected, first in the
browser and again on the server. Card numbers are never stored; the payment reference keeps only the last four digits.

## Roles and permissions

| Action                                             | Client        | Staff           | Admin |
| -------------------------------------------------- | ------------- | --------------- | ----- |
| Book appointments                                  | For self      | For any client  | ✓     |
| Cancel appointments                                | Own, upcoming | ✓               | ✓     |
| Complete, mark no-show, reschedule                 |               | ✓               | ✓     |
| View payments                                      | Own           | All             | All   |
| Pay online (test card)                             | ✓             |                 |       |
| Record payments, export CSV                        |               | ✓               | ✓     |
| Refund payments                                    |               |                 | ✓     |
| Create, edit, unlock clients, reset their password |               | ✓               | ✓     |
| Deactivate accounts, change roles                  |               |                 | ✓     |
| Manage staff accounts and services                 |               | View services   | ✓     |
| View the activity log                              |               |                 | ✓     |

Permissions are enforced by the API; the interface only hides what a role can't use.

## Security

- Passwords are hashed with bcrypt. Sessions are signed JWTs in `httpOnly`, `SameSite=Strict` cookies that last 8 hours.
- The signed-in user is re-checked on every request, so deactivating an account or changing its role takes effect immediately.
- Five failed sign-ins lock an account for 15 minutes. Sign-in and sign-up are also rate-limited per IP address.
- Accounts created by staff, and password resets, get a one-time temporary password that must be changed after signing in.
- Every request body and query is validated with zod. Security headers come from Helmet.

## Tech stack

| Layer    | Tools                                                                   |
| -------- | ----------------------------------------------------------------------- |
| Frontend | React 19, TypeScript, Vite, React Router. Plain CSS, no UI library      |
| Backend  | Node.js, Express 5, TypeScript, zod, bcryptjs, jsonwebtoken, Helmet     |
| Database | SQLite via better-sqlite3 (a single file, no database server needed)    |

## Project structure

```
booking-system/
├── package.json          npm workspaces and top-level scripts
├── client/               React app (Vite dev server on :5173, proxies /api to :4000)
│   └── src/
│       ├── pages/        one component per screen
│       ├── components/   layout, forms, checkout, shared UI
│       ├── api.ts        fetch wrapper and useApi hook
│       └── auth.tsx      sign-in state
└── server/               Express API on :4000
    └── src/
        ├── routes/       auth, users, appointments, payments, services, dashboard, audit
        ├── lib/          sessions, audit logging, demo data and resets
        ├── db.ts         SQLite schema
        └── seed.ts       `npm run seed`
```

## Scripts

Run from the project root.

| Command             | What it does                                                           |
| ------------------- | ---------------------------------------------------------------------- |
| `npm run dev`       | Starts the API and the web app with hot reload                         |
| `npm run seed`      | Wipes the database and loads fresh demo data                           |
| `npm run build`     | Builds the server and the client for production                        |
| `npm start`         | Serves the production build on port 4000 (needs `JWT_SECRET`)          |
| `npm run demo`      | Builds, then serves in demo mode on port 4000                          |
| `npm run typecheck` | Type-checks both packages                                              |

## Configuration

Set these as environment variables for the server.

| Variable             | Default           | Description                                                        |
| -------------------- | ----------------- | ------------------------------------------------------------------ |
| `PORT`               | `4000`            | Port for the API (and the built app in production)                 |
| `JWT_SECRET`         | —                 | Secret for signing sessions. Required for `npm start`              |
| `DB_FILE`            | `data/booking.db` | SQLite file, relative to `server/`                                 |
| `DEMO_MODE`          | off               | `1` turns on demo mode (set automatically by `npm run demo`)       |
| `DEMO_RESET_MINUTES` | `60`              | How often demo data resets, in minutes (minimum 5)                 |

Production without demo mode:

```bash
npm run build
JWT_SECRET="$(openssl rand -hex 32)" npm start
```

Keep the same `JWT_SECRET` across restarts, or everyone is signed out whenever the server restarts.

## API

All endpoints are under `/api`, take and return JSON, and use the session cookie set by `/api/auth/login`.

| Area         | Endpoints                                                                                                   |
| ------------ | ----------------------------------------------------------------------------------------------------------- |
| Auth         | `POST /auth/login`, `POST /auth/register`, `POST /auth/logout`, `GET /auth/me`, `PATCH /auth/me`, `POST /auth/me/password` |
| Accounts     | `GET /users`, `POST /users`, `GET /users/:id`, `PATCH /users/:id`, `POST /users/:id/unlock`, `POST /users/:id/reset-password` |
| Appointments | `GET /appointments`, `POST /appointments`, `PATCH /appointments/:id`, `GET /appointments/providers`         |
| Payments     | `GET /payments`, `POST /payments`, `POST /payments/checkout`, `PATCH /payments/:id/status`, `GET /payments/export.csv` |
| Services     | `GET /services`, `POST /services`, `PUT /services/:id`                                                      |
| Other        | `GET /dashboard/summary`, `GET /audit`, `GET /demo`, `GET /health`                                          |

## Troubleshooting

- **`npm install` fails while building better-sqlite3:** you're probably on an unusual platform or Node version with no
  prebuilt binary. Use Node.js 22, or install build tools (`build-essential` and `python3` on Debian/Ubuntu).
- **Sign-in doesn't stick in production:** the site is being served over plain HTTP on a non-localhost address.
  Put it behind HTTPS.
- **Port already in use:** set `PORT` for the API. The Vite dev server port is in `client/vite.config.ts`.
