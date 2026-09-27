import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { db } from './db.js';
import { demoStatus, seedDemoData, startDemoResets } from './lib/demo.js';
import { requireAuth, requireRole } from './lib/auth.js';
import { errorHandler } from './lib/http.js';
import { appointmentsRouter } from './routes/appointments.js';
import { auditRouter } from './routes/audit.js';
import { authRouter } from './routes/auth.js';
import { dashboardRouter } from './routes/dashboard.js';
import { paymentsRouter } from './routes/payments.js';
import { servicesRouter } from './routes/services.js';
import { usersRouter } from './routes/users.js';

const app = express();
app.set('trust proxy', 'loopback');
// HTTPS redirects and HSTS belong to the reverse proxy; don't force-upgrade plain-HTTP deployments here.
app.use(helmet({ contentSecurityPolicy: { directives: { upgradeInsecureRequests: null } } }));
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});
app.get('/api/demo', (_req, res) => {
  res.json(demoStatus());
});
app.use('/api/auth', authRouter);
app.use('/api/users', requireAuth, usersRouter);
app.use('/api/services', requireAuth, servicesRouter);
app.use('/api/appointments', requireAuth, appointmentsRouter);
app.use('/api/payments', requireAuth, paymentsRouter);
app.use('/api/dashboard', requireAuth, requireRole('admin', 'staff'), dashboardRouter);
app.use('/api/audit', requireAuth, requireRole('admin'), auditRouter);
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// In production the API also serves the built React app.
if (config.isProd) {
  const clientDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');
  app.use(express.static(clientDist));
  app.get('/{*splat}', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.use(errorHandler);

if (config.demoMode) {
  startDemoResets();
} else if (!db.prepare('SELECT 1 FROM users LIMIT 1').get()) {
  const c = seedDemoData();
  console.log(`Empty database: loaded demo data (${c.users} users). Demo logins are listed in README.md.`);
}

app.listen(config.port, () => {
  console.log(`API listening on http://localhost:${config.port}`);
});
