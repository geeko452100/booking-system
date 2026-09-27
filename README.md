# Booking System

A full-stack appointment booking app with a staff dashboard, client self-service portal, account management and
payment records. Built with **React** and **TypeScript**, and runs on **Cloudflare Workers** with a **D1** database.

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

Requires **Node.js 22** and npm. You don't need a Cloudflare account to run it locally.

```bash
git clone <this-repo-url> booking-system
cd booking-system
npm install
npm run dev
```

Open **http://localhost:5173**. The first request loads demo data into a local D1 database. Sign in with:

| Role   | Email                | Password     |
| ------ | -------------------- | ------------ |
| Admin  | `admin@example.com`  | `Admin123!`  |
| Staff  | `sam@example.com`    | `Staff123!`  |
| Client | `client@example.com` | `Client123!` |

To wipe the local database and reload fresh demo data at any time, run `npm run seed`.

## Deploying to Cloudflare

The app deploys as one Cloudflare Worker: the React build is served as static assets, `/api/*` runs the Worker,
data lives in D1, and a Cron Trigger resets the demo data every hour. HTTPS is included.

One-time setup, run from the `server/` folder:

```bash
cd server
npx wrangler login
npx wrangler d1 create booking
```

Copy the `database_id` it prints into `server/wrangler.jsonc`, replacing `00000000-0000-0000-0000-000000000000`. Then:

```bash
npx wrangler d1 migrations apply DB --remote   # create the tables
npx wrangler secret put JWT_SECRET             # paste a long random value, e.g. from `openssl rand -hex 32`
cd ..
npm run deploy
```

Wrangler prints the site's address (`https://booking-system.<your-subdomain>.workers.dev`). The first visit loads
the demo data. To deploy changes later, just run `npm run deploy` again.

> **Plan note.** The Workers Free plan allows 10 ms of CPU per request. Checking a password (PBKDF2 with 100,000
> iterations) takes longer than that. Cloudflare allows occasional overruns, so a lightly used demo may be fine on the
> free plan, but if sign-ins fail with an "exceeded CPU" error, switch to Workers Paid ($5/month), which allows 30 seconds.

### Demo mode

Demo mode is on by default (`DEMO_MODE` in `server/wrangler.jsonc`) and is designed for sharing a public link:

- **Data resets itself** every hour, so dates stay current and visitors' changes are cleared. A bar on every page says
  when the next reset is.
- **The demo logins can't be broken.** They never lock after wrong passwords, and their password, email, role and
  status can't be changed, so one visitor can't lock out the next.
- **Everyone is signed out at each reset**, with a message explaining why.
- **One-click sign-in:** the sign-in page has Admin / Staff / Client buttons.

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

- Passwords are hashed with PBKDF2-SHA256 (100,000 iterations, the most Workers allows). Sessions are signed JWTs in
  `httpOnly`, `SameSite=Strict`, `Secure` cookies that last 8 hours.
- The signed-in user is re-checked on every request, so deactivating an account or changing its role takes effect immediately.
- Five failed sign-ins lock an account for 15 minutes. Sign-in and sign-up are also limited to 20 attempts per minute
  per IP address, using Cloudflare's rate limiting binding.
- Accounts created by staff, and password resets, get a one-time temporary password that must be changed after signing in.
- Double-booking and double-payment checks run inside the same database write, so simultaneous requests can't both succeed.
- Every request body and query is validated with zod. The API and the static site both send security headers,
  including a Content Security Policy.

## Tech stack

| Layer    | Tools                                                                        |
| -------- | ---------------------------------------------------------------------------- |
| Frontend | React 19, TypeScript, Vite, React Router. Plain CSS, no UI library           |
| Backend  | Cloudflare Workers, Hono, TypeScript, zod, Web Crypto                        |
| Data     | Cloudflare D1 (SQLite), with a Cron Trigger for demo resets                  |
| Tooling  | Wrangler for local development (simulates Workers and D1) and deployment     |

## Project structure

```
booking-system/
├── package.json            npm workspaces and top-level scripts
├── client/                 React app (Vite dev server on :5173, proxies /api to :4000)
│   ├── public/_headers     security headers for the static site
│   └── src/
│       ├── pages/          one component per screen
│       ├── components/     layout, forms, checkout, shared UI
│       ├── api.ts          fetch wrapper and useApi hook
│       └── auth.tsx        sign-in state
└── server/                 Cloudflare Worker (wrangler dev on :4000)
    ├── wrangler.jsonc      Worker, D1, rate limit, cron and demo settings
    ├── migrations/         D1 schema
    ├── scripts/            local dev helpers, seed SQL generator
    └── src/
        ├── index.ts        routes, fetch and scheduled handlers
        ├── routes/         auth, users, appointments, payments, services, dashboard, audit
        ├── lib/            sessions, passwords, audit logging, demo mode
        ├── db.ts           D1 query helpers
        └── seed-data.ts    demo data
```

## Scripts

Run from the project root.

| Command             | What it does                                                                     |
| ------------------- | -------------------------------------------------------------------------------- |
| `npm run dev`       | Starts the Worker (with a local D1 database) and the web app with hot reload     |
| `npm run seed`      | Wipes the local database and loads fresh demo data                               |
| `npm run build`     | Builds the React app into `client/dist`                                          |
| `npm run deploy`    | Builds the React app and deploys everything to Cloudflare                        |
| `npm run typecheck` | Type-checks both packages                                                        |

In `server/`: `npm run seed:remote` resets the deployed database, and `npm run db:migrate:remote` applies new migrations to it.

## Configuration

Settings live in `server/wrangler.jsonc` under `vars`. Run `npm run deploy` after changing them.

| Variable             | Default            | Description                                                                  |
| -------------------- | ------------------ | ---------------------------------------------------------------------------- |
| `DEMO_MODE`          | `"1"`              | `"1"` turns on demo mode. Anything else turns it off                         |
| `DEMO_RESET_MINUTES` | `"60"`             | How often demo data resets. Change the `crons` schedule in the same file to match |
| `DEMO_TIMEZONE`      | `America/New_York` | Demo appointments are placed between 9am and 5pm in this timezone            |
| `JWT_SECRET`         | —                  | Secret for signing sessions. Set with `wrangler secret put`; locally it comes from `server/.dev.vars`, created on first `npm run dev` |

A new, empty database is always filled with demo data on its first request, even outside demo mode. That includes
the demo accounts and their published passwords, so change or deactivate those accounts before using the app for anything real.

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

- **`Server is missing JWT_SECRET`:** run `npx wrangler secret put JWT_SECRET` in `server/`, then deploy again.
- **`no such table` errors after deploying:** the remote database has no tables yet. Run
  `npx wrangler d1 migrations apply DB --remote` in `server/`.
- **Sign-in fails with "exceeded CPU" on the free plan:** see the plan note under [Deploying to Cloudflare](#deploying-to-cloudflare).
- **"Too many attempts":** more than 20 sign-ins came from one IP address in a minute. Wait a minute.
- **Port already in use:** the Worker's port is in `server/package.json` (`wrangler dev --port 4000`), and the Vite
  port and proxy are in `client/vite.config.ts`.
