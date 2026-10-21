# Acme Law: Law Firm Client Portal

A full-stack client portal for **Acme Law**, a fictional law firm. Clients follow their cases, send documents,
message their attorney, book meetings and pay invoices. Attorneys and partners run the firm side: a case pipeline,
document requests and review, a shared inbox, scheduling, billing, client accounts and an activity log.
Built with **React** and **TypeScript**, and runs on **Cloudflare Workers** with a **D1** database.

> **This is a demo project.** Acme Law is not a real firm and nothing here is legal advice. Payments run in test
> mode only, so no real money is taken and real card numbers are rejected. Document uploads record only a file's name
> and size; the file itself never leaves the browser.

<!-- Screenshots: add images to docs/ and reference them here, e.g. ![Client home](docs/client-home.png) -->

## Features

**For clients**
- **Home:** a photo banner, open matters with a progress tracker, documents the firm is waiting for, the next meeting,
  the latest message, files shared by the firm, balance due and the legal team with headshots.
- **Matters:** each case moves through Intake → Fact-finding → Negotiation → Resolution → Closed, with the lead
  attorney, the next step and its target date.
- **Documents:** answer the firm's document requests by dragging in a file, upload anything else, and find everything
  the firm has shared.
- **Messages:** a private thread with the firm, with unread counts in the sidebar.
- **Meetings, billing and practice areas:** book a consultation from photo cards, cancel upcoming meetings, and pay
  invoices with a test card.

**For attorneys and partners**
- **Dashboard:** today's schedule with one-click Complete / No-show / Reschedule / Cancel, a case pipeline by stage,
  unread client messages, uploads waiting for review, fees collected, unpaid invoices and locked-account alerts.
- **Matters:** open a matter, move it between stages and edit the next step the client sees.
- **Documents:** request documents from a client, share files with them, then mark uploads reviewed or ask again.
- **Messages:** a shared inbox across all client threads.
- **Clients:** search and filter, a client file with matters, documents, meetings, payments, contact details, internal
  notes and sign-in history, plus one-click unlock, password reset and deactivation.
- **Meetings and billing:** double-booking a client or attorney is blocked. Record payments, filter, export to CSV and
  issue refunds (partners only).
- **Practice areas:** meeting types with a photo, duration and fee, and whether clients can book them.
- **Activity log:** every sign-in, failed attempt, lockout, account change, matter update, document, message,
  booking and payment, with who did it and when.

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

| Role                       | Who                            | Email                | Password     |
| -------------------------- | ------------------------------ | -------------------- | ------------ |
| Partner (admin)            | Eleanor Reid, Managing Partner | `admin@example.com`  | `Admin123!`  |
| Attorney (staff)           | Sam Rivera, Senior Associate   | `sam@example.com`    | `Staff123!`  |
| Client                     | Priya Patel                    | `client@example.com` | `Client123!` |

Priya's account tells a story: a commercial lease dispute in negotiation with a draft settlement waiting, an estate plan
in fact-finding, a closed trademark matter, three outstanding document requests and an unread message from Sam.

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
npx wrangler d1 migrations apply DB --remote   # create the tables (run again whenever migrations/ changes)
npx wrangler secret put JWT_SECRET             # paste a long random value, e.g. from `openssl rand -hex 32`
cd ..
npm run deploy
```

> **Upgrading an existing deployment?** The client portal adds `migrations/0002_client_portal.sql`. Apply it with
> `npx wrangler d1 migrations apply DB --remote` from `server/` **before** deploying, or the hourly demo reset will fail.

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

Clients pay from **Billing → Invoices to pay**. A banner on the page lists the test cards:

| Card number           | Result   |
| --------------------- | -------- |
| `4242 4242 4242 4242` | Approved |
| `5555 5555 5555 4444` | Approved |
| `4000 0000 0000 0002` | Declined |

Use any future expiry date (e.g. `12/34`) and any 3-digit CVC. Any other card number is rejected, first in the
browser and again on the server. Card numbers are never stored; the payment reference keeps only the last four digits.

## Roles and permissions

In the code and API, partners are `admin` and attorneys are `staff`.

| Action                                             | Client          | Attorney        | Partner |
| -------------------------------------------------- | --------------- | --------------- | ------- |
| View matters and their stage                       | Own             | All             | All     |
| Open matters, change stage and next step           |                 | ✓               | ✓       |
| Upload documents / answer document requests        | ✓               |                 |         |
| Request, share and review documents                |                 | ✓               | ✓       |
| Send messages                                      | Own thread      | Any client      | ✓       |
| Book meetings                                      | For self        | For any client  | ✓       |
| Cancel meetings                                    | Own, upcoming   | ✓               | ✓       |
| Complete, mark no-show, reschedule                 |                 | ✓               | ✓       |
| View payments                                      | Own             | All             | All     |
| Pay online (test card)                             | ✓               |                 |         |
| Record payments, export CSV                        |                 | ✓               | ✓       |
| Refund payments                                    |                 |                 | ✓       |
| Create, edit, unlock clients, reset their password |                 | ✓               | ✓       |
| Deactivate accounts, change roles                  |                 |                 | ✓       |
| Manage team accounts and practice areas            | View practice areas | View        | ✓       |
| View the activity log                              |                 |                 | ✓       |

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
│   ├── public/img/         bundled photos: sign-in, banner, team headshots, practice areas
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
        ├── routes/         auth, users, matters, documents, messages, appointments, payments, services, dashboard, audit
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
| Matters      | `GET /matters`, `POST /matters`, `PATCH /matters/:id`                                                       |
| Documents    | `GET /documents`, `POST /documents`, `POST /documents/requests`, `PATCH /documents/:id`                     |
| Messages     | `GET /messages`, `POST /messages`, `GET /messages/threads`, `GET /messages/unread`                          |
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

## Photo credits

All photos are from [Unsplash](https://unsplash.com) and used under the [Unsplash License](https://unsplash.com/license).
They are bundled in `client/public/img`, because the site's Content Security Policy only allows images it serves itself.
The people pictured are models, not real attorneys.

| File                            | Photographer                                                       | Source |
| ------------------------------- | ------------------------------------------------------------------ | ------ |
| `img/library.jpg`               | Giammarco Boscaro                                                  | [unsplash.com/photos/zeH-ljawHtg](https://unsplash.com/photos/zeH-ljawHtg) |
| `img/courthouse.jpg`            | Sebastian Pichler                                                  | [unsplash.com/photos/bAQH53VquTc](https://unsplash.com/photos/bAQH53VquTc) |
| `img/team/eleanor-reid.jpg`     | Christina @ wocintechchat.com                                      | [unsplash.com/photos/SJvDxw0azqw](https://unsplash.com/photos/SJvDxw0azqw) |
| `img/team/sam-rivera.jpg`       | LinkedIn Sales Solutions                                           | [unsplash.com/photos/pAtA8xe_iVM](https://unsplash.com/photos/pAtA8xe_iVM) |
| `img/team/jordan-lee.jpg`       | Christina @ wocintechchat.com                                      | [unsplash.com/photos/0Zx1bDv5BNY](https://unsplash.com/photos/0Zx1bDv5BNY) |
| `img/practice/consultation.jpg` | Vitaly Gariev                                                      | [unsplash.com/photos/XjJmfN7QJj4](https://unsplash.com/photos/XjJmfN7QJj4) |
| `img/practice/contracts.jpg`    | Vitaly Gariev                                                      | [unsplash.com/photos/FKnEYIEVOyI](https://unsplash.com/photos/FKnEYIEVOyI) |
| `img/practice/estate.jpg`       | Gabrielle Henderson                                                | [unsplash.com/photos/HJckKnwCXxQ](https://unsplash.com/photos/HJckKnwCXxQ) |
| `img/practice/litigation.jpg`   | Sasun Bughdaryan                                                   | [unsplash.com/photos/ozS0tPf8QT0](https://unsplash.com/photos/ozS0tPf8QT0) |
| `img/practice/drafting.jpg`     | Scott Graham                                                       | [unsplash.com/photos/OQMZwNd3ThU](https://unsplash.com/photos/OQMZwNd3ThU) |
| `img/practice/disputes.jpg`     | Tingey Injury Law Firm                                             | [unsplash.com/photos/DZpc4UY8ZtY](https://unsplash.com/photos/DZpc4UY8ZtY) |
