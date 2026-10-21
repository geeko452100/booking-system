# Booking & Client Portal for Local Businesses

One booking and client-portal app that can be set up for different kinds of local business. Pick the business type
and the whole site changes to fit: the name, colors, photos, wording, services and prices, and which features clients
see. Built with **React** and **TypeScript**, and runs on **Cloudflare Workers** with a **D1** database.

| Business type      | Demo name             | Bookings are… | Extra features                                          |
| ------------------ | --------------------- | ------------- | ------------------------------------------------------- |
| Home services      | Acme Home Services    | Visits        | **Jobs** tracker (Requested → Quoted → … → Complete), **Files** (quotes, photos, warranties) |
| Salon & barber     | Acme Salon & Barber   | Appointments  | Kept simple: booking, payments and messages             |
| Personal training  | Acme Fitness Studio   | Sessions      | **Programs** tracker (Intro → Assessment → … → Complete), **Forms & plans** |
| Pet grooming       | Acme Pet Grooming     | Appointments  | **Pet records** (vaccinations, report cards), the pet's name on every booking |

Every type has booking, online payments (test mode), secure messages, client accounts, a staff dashboard and an
activity log.

> **This is a demo project.** The businesses are made up. Payments run in test mode only: no real money is taken and
> real card numbers are rejected. File uploads record only a file's name and size; the file itself never leaves the browser.

<!-- Screenshots: add images to docs/ and reference them here, e.g. ![Client home](docs/client-home.png) -->

## Choosing the business type

- **The owner sets it** under **My account → Business type** (admin only). It's stored in the database, so the whole
  site changes for everyone.
- **On the public demo**, anyone can switch from the sign-in page or the bar at the top of every page. In demo mode the
  choice is saved in a cookie, so it only changes that visitor's view; the owner's setting stays the default for everyone else.

Each business type has its own services, bookings, payments, jobs or programs, files and message threads. Accounts are
shared, so the same demo logins work for every type, and a team member's job title and photo depend on the type.

To add a business type, add an entry to `client/src/business.tsx` (name, wording, features, colors in `styles.css`),
`server/src/business-types.ts` and `server/src/seed-content.ts` (demo services and story), and put its photos in
`client/public/img/<type>/`.

## Features

**For clients**
- **Home:** a photo banner, the next booking, open jobs or programs with a progress tracker, files the business is
  waiting for, the latest message, files shared with them, balance due and the team with headshots.
- **Booking:** pick a service from photo cards and a team member; cancel upcoming bookings.
- **Files:** answer the business's requests by dragging in a file, or upload anything else.
- **Messages:** a private thread with the business, with unread counts in the sidebar.
- **Billing:** see what's owed and pay with a test card.

**For the owner and team**
- **Dashboard:** today's schedule with one-click Complete / No-show / Reschedule / Cancel, a pipeline by stage (when
  the business uses jobs or programs), unread messages, uploads to review, revenue, unpaid bookings and locked-account alerts.
- **Jobs / programs:** create them, move them between stages and edit the next step the client sees.
- **Files:** request files from a client, share files with them, then mark uploads reviewed or ask again.
- **Messages:** a shared inbox across all client threads.
- **Clients:** search and filter, a client file with bookings, payments, jobs or programs, files, contact details,
  internal notes and sign-in history, plus one-click unlock, password reset and deactivation.
- **Bookings and billing:** double-booking a client or team member is blocked. Record payments, filter, export to CSV
  and issue refunds (owner only).
- **Services:** name, photo, duration, price, and whether clients can book it.
- **Activity log:** every sign-in, failed attempt, lockout, account change, booking, file, message and payment.

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

| Role                | Who          | Email                | Password     |
| ------------------- | ------------ | -------------------- | ------------ |
| Owner (admin)       | Eleanor Reid | `admin@example.com`  | `Admin123!`  |
| Team member (staff) | Sam Rivera   | `sam@example.com`    | `Staff123!`  |
| Client              | Priya Patel  | `client@example.com` | `Client123!` |

Priya's account tells a short story in each business type: an AC replacement waiting for quote approval (home
services), a color appointment with an unread note from her stylist (salon), a strength program and a food log to send
(training), and a rabies certificate to upload for her corgi, Biscuit (pet grooming).

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

> **Upgrading an existing deployment?** Apply new migrations with `npx wrangler d1 migrations apply DB --remote` from
> `server/` **before** deploying, or the hourly demo reset will fail. `0003_multi_business.sql` recreates the portal
> tables (they only held demo data), so run `npm run seed:remote` afterwards to load data for every business type.

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
- **One-click sign-in:** the sign-in page has Owner / Team member / Client buttons.
- **Business switcher:** visitors can try every business type without affecting each other.

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

In the code and API, the owner is `admin` and team members are `staff`. Each business type gives them its own
names (Owner, Technician, Stylist, Coach, Groomer; Customer, Client, Member).

| Action                                             | Client          | Team member     | Owner |
| -------------------------------------------------- | --------------- | --------------- | ----- |
| View jobs / programs and their stage               | Own             | All             | All   |
| Create jobs / programs, change stage and next step |                 | ✓               | ✓     |
| Upload files / answer file requests                | ✓               |                 |       |
| Request, share and review files                    |                 | ✓               | ✓     |
| Send messages                                      | Own thread      | Any client      | ✓     |
| Book                                               | For self        | For any client  | ✓     |
| Cancel bookings                                    | Own, upcoming   | ✓               | ✓     |
| Complete, mark no-show, reschedule                 |                 | ✓               | ✓     |
| View payments                                      | Own             | All             | All   |
| Pay online (test card)                             | ✓               |                 |       |
| Record payments, export CSV                        |                 | ✓               | ✓     |
| Refund payments                                    |                 |                 | ✓     |
| Create, edit, unlock clients, reset their password |                 | ✓               | ✓     |
| Deactivate accounts, change roles                  |                 |                 | ✓     |
| Manage team accounts and services                  | View services   | View services   | ✓     |
| Change the business type                           |                 |                 | ✓     |
| View the activity log                              |                 |                 | ✓     |

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
│   ├── public/img/<type>/  bundled photos per business type: sign-in, banner, team, services
│   └── src/
│       ├── pages/          one component per screen
│       ├── components/     layout, forms, checkout, shared UI
│       ├── business.tsx    business types: names, wording, features, and the current type
│       ├── api.ts          fetch wrapper and useApi hook
│       └── auth.tsx        sign-in state
└── server/                 Cloudflare Worker (wrangler dev on :4000)
    ├── wrangler.jsonc      Worker, D1, rate limit, cron and demo settings
    ├── migrations/         D1 schema
    ├── scripts/            local dev helpers, seed SQL generator
    └── src/
        ├── index.ts        routes, fetch and scheduled handlers
        ├── routes/         auth, business, users, projects, documents, messages, appointments, payments, services, dashboard, audit
        ├── lib/            sessions, passwords, audit logging, demo mode
        ├── db.ts           D1 query helpers
        ├── business-types.ts  the list of business types
        ├── seed-content.ts    demo services, team titles and stories per business type
        └── seed-data.ts       turns that content into demo data
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
| Business     | `GET /business`, `PUT /business`                                                                            |
| Projects     | `GET /projects`, `POST /projects`, `PATCH /projects/:id`                                                    |
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
The people pictured are models, not the (made-up) staff.

| File | Photographer | Source |
| ---- | ------------ | ------ |
| `img/home/hero.jpg` | Sieuwert Otterloo | [unsplash.com/photos/aren8nutd1Q](https://unsplash.com/photos/aren8nutd1Q) |
| `img/home/banner.jpg` | todd kent | [unsplash.com/photos/178j8tJrNlc](https://unsplash.com/photos/178j8tJrNlc) |
| `img/home/team/eleanor.jpg` | Clay Elliot | [unsplash.com/photos/mpDV4xaFP8c](https://unsplash.com/photos/mpDV4xaFP8c) |
| `img/home/team/sam.jpg` | Ryan Hoffman | [unsplash.com/photos/Ft4p5E9HjTQ](https://unsplash.com/photos/Ft4p5E9HjTQ) |
| `img/home/team/jordan.jpg` | Willian Souza | [unsplash.com/photos/p5BoBF0XJUA](https://unsplash.com/photos/p5BoBF0XJUA) |
| `img/home/services/ac-tune-up.jpg` | Everett Pachmann | [unsplash.com/photos/JsPkVrHMQoo](https://unsplash.com/photos/JsPkVrHMQoo) |
| `img/home/services/furnace-check.jpg` | HUUM | [unsplash.com/photos/3_nf1qKJGf4](https://unsplash.com/photos/3_nf1qKJGf4) |
| `img/home/services/repair.jpg` | Kevin Grieve | [unsplash.com/photos/3CKZS3-o3XU](https://unsplash.com/photos/3CKZS3-o3XU) |
| `img/home/services/estimate.jpg` | alpha innotec | [unsplash.com/photos/kblddocwPa0](https://unsplash.com/photos/kblddocwPa0) |
| `img/home/services/deep-clean.jpg` | Vitaly Gariev | [unsplash.com/photos/YWS51jdrfdA](https://unsplash.com/photos/YWS51jdrfdA) |
| `img/home/services/standard-clean.jpg` | JESHOOTS.COM | [unsplash.com/photos/__ZMnefoI3k](https://unsplash.com/photos/__ZMnefoI3k) |
| `img/salon/hero.jpg` | Greg Trowman | [unsplash.com/photos/jsuWg7IXx1k](https://unsplash.com/photos/jsuWg7IXx1k) |
| `img/salon/banner.jpg` | Benyamin Bohlouli | [unsplash.com/photos/LGXN4OSQSa4](https://unsplash.com/photos/LGXN4OSQSa4) |
| `img/salon/team/eleanor.jpg` | Giorgio Trovato | [unsplash.com/photos/VzusBjHlKM8](https://unsplash.com/photos/VzusBjHlKM8) |
| `img/salon/team/sam.jpg` | Jurica Koletić | [unsplash.com/photos/7YVZYZeITc8](https://unsplash.com/photos/7YVZYZeITc8) |
| `img/salon/team/jordan.jpg` | Christina @ wocintechchat.com | [unsplash.com/photos/SJvDxw0azqw](https://unsplash.com/photos/SJvDxw0azqw) |
| `img/salon/services/womens-cut.jpg` | Alexander Mass | [unsplash.com/photos/g0cSOCHaHiY](https://unsplash.com/photos/g0cSOCHaHiY) |
| `img/salon/services/mens-cut.jpg` | Nate Johnston | [unsplash.com/photos/tgPrIYnW3g4](https://unsplash.com/photos/tgPrIYnW3g4) |
| `img/salon/services/beard.jpg` | Nathon Oski | [unsplash.com/photos/fE42nRlBcG8](https://unsplash.com/photos/fE42nRlBcG8) |
| `img/salon/services/color.jpg` | "Jessie Dee" Dabrowski | [unsplash.com/photos/W6cwaL7PMSw](https://unsplash.com/photos/W6cwaL7PMSw) |
| `img/salon/services/blowout.jpg` | Adam Winger | [unsplash.com/photos/FkAZqQJTbXM](https://unsplash.com/photos/FkAZqQJTbXM) |
| `img/salon/services/treatment.jpg` | Lindsay Cash | [unsplash.com/photos/Md_DhaFsnCQ](https://unsplash.com/photos/Md_DhaFsnCQ) |
| `img/fitness/hero.jpg` | Meghan Holmes | [unsplash.com/photos/buWcS7G1_28](https://unsplash.com/photos/buWcS7G1_28) |
| `img/fitness/banner.jpg` | Vitaly Gariev | [unsplash.com/photos/rD0poLlu57M](https://unsplash.com/photos/rD0poLlu57M) |
| `img/fitness/team/eleanor.jpg` | Joecalih | [unsplash.com/photos/1l6UeCc9P9o](https://unsplash.com/photos/1l6UeCc9P9o) |
| `img/fitness/team/sam.jpg` | Vitaly Gariev | [unsplash.com/photos/V-gUIqzSXig](https://unsplash.com/photos/V-gUIqzSXig) |
| `img/fitness/team/jordan.jpg` | Samuel Girven | [unsplash.com/photos/Ppua0I4VjqE](https://unsplash.com/photos/Ppua0I4VjqE) |
| `img/fitness/services/intro.jpg` | Victor Freitas | [unsplash.com/photos/hOuJYX2K5DA](https://unsplash.com/photos/hOuJYX2K5DA) |
| `img/fitness/services/personal.jpg` | maxhome fitness | [unsplash.com/photos/wSUlQl8HPYc](https://unsplash.com/photos/wSUlQl8HPYc) |
| `img/fitness/services/assessment.jpg` | Vitaly Gariev | [unsplash.com/photos/6ESp0qoio_I](https://unsplash.com/photos/6ESp0qoio_I) |
| `img/fitness/services/small-group.jpg` | bruce mars | [unsplash.com/photos/y0SMHt74yqc](https://unsplash.com/photos/y0SMHt74yqc) |
| `img/fitness/services/partner.jpg` | Jonathan Borba | [unsplash.com/photos/R0y_bEUjiOM](https://unsplash.com/photos/R0y_bEUjiOM) |
| `img/fitness/services/nutrition.jpg` | Ella Olsson | [unsplash.com/photos/lMcRyBx4G50](https://unsplash.com/photos/lMcRyBx4G50) |
| `img/pet/hero.jpg` | Victor G | [unsplash.com/photos/N04FIfHhv_k](https://unsplash.com/photos/N04FIfHhv_k) |
| `img/pet/banner.jpg` | Joe Caione | [unsplash.com/photos/qO-PIF84Vxg](https://unsplash.com/photos/qO-PIF84Vxg) |
| `img/pet/team/eleanor.jpg` | alex starnes | [unsplash.com/photos/WYE2UhXsU1Y](https://unsplash.com/photos/WYE2UhXsU1Y) |
| `img/pet/team/sam.jpg` | Александр Гросс | [unsplash.com/photos/dHIRbh9En6I](https://unsplash.com/photos/dHIRbh9En6I) |
| `img/pet/team/jordan.jpg` | Christina @ wocintechchat.com | [unsplash.com/photos/0Zx1bDv5BNY](https://unsplash.com/photos/0Zx1bDv5BNY) |
| `img/pet/services/full-groom.jpg` | Buddy AN | [unsplash.com/photos/LpK2xddrElI](https://unsplash.com/photos/LpK2xddrElI) |
| `img/pet/services/bath.jpg` | Jamie Street | [unsplash.com/photos/ikv10lHZUas](https://unsplash.com/photos/ikv10lHZUas) |
| `img/pet/services/puppy.jpg` | Alvan Nee | [unsplash.com/photos/eoqnr8ikwFE](https://unsplash.com/photos/eoqnr8ikwFE) |
| `img/pet/services/cat.jpg` | Reba Spike | [unsplash.com/photos/4y7030O1XPQ](https://unsplash.com/photos/4y7030O1XPQ) |
| `img/pet/services/deshed.jpg` | Neakasa | [unsplash.com/photos/s1cbq_XroX0](https://unsplash.com/photos/s1cbq_XroX0) |
| `img/pet/services/spa.jpg` | Hayffield L | [unsplash.com/photos/ZVdZw2p08y4](https://unsplash.com/photos/ZVdZw2p08y4) |
