import { Hono } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
import { requireAuth, requireRole, type AppEnv } from './lib/auth.js';
import { resolveBusiness } from './lib/business.js';
import { demoMode, demoStatus, ensureSeeded, resetDemoData } from './lib/demo.js';
import { onError } from './lib/http.js';
import { appointmentsRouter } from './routes/appointments.js';
import { auditRouter } from './routes/audit.js';
import { authRouter } from './routes/auth.js';
import { businessRouter } from './routes/business.js';
import { dashboardRouter } from './routes/dashboard.js';
import { documentsRouter } from './routes/documents.js';
import { messagesRouter } from './routes/messages.js';
import { paymentsRouter } from './routes/payments.js';
import { projectsRouter } from './routes/projects.js';
import { servicesRouter } from './routes/services.js';
import { usersRouter } from './routes/users.js';

// Only /api/* reaches the Worker; everything else is served from the React build (see wrangler.jsonc).
const app = new Hono<AppEnv>().basePath('/api');

app.use(secureHeaders());
app.use(async (_c, next) => {
  await ensureSeeded();
  await next();
});
app.use(resolveBusiness);

app.get('/health', (c) => c.json({ ok: true }));
app.get('/demo', async (c) => c.json(await demoStatus()));
app.route('/auth', authRouter);
app.route('/business', businessRouter);

app.use('/users/*', requireAuth);
app.use('/services/*', requireAuth);
app.use('/appointments/*', requireAuth);
app.use('/payments/*', requireAuth);
app.use('/projects/*', requireAuth);
app.use('/documents/*', requireAuth);
app.use('/messages/*', requireAuth);
app.use('/dashboard/*', requireAuth, requireRole('admin', 'staff'));
app.use('/audit/*', requireAuth, requireRole('admin'));

app.route('/users', usersRouter);
app.route('/services', servicesRouter);
app.route('/appointments', appointmentsRouter);
app.route('/payments', paymentsRouter);
app.route('/projects', projectsRouter);
app.route('/documents', documentsRouter);
app.route('/messages', messagesRouter);
app.route('/dashboard', dashboardRouter);
app.route('/audit', auditRouter);

app.notFound((c) => c.json({ error: 'Not found' }, 404));
app.onError(onError);

export default {
  fetch: app.fetch,
  // Cron Trigger (see wrangler.jsonc): fresh demo data on a schedule.
  async scheduled(_controller, _env, ctx) {
    if (demoMode()) ctx.waitUntil(resetDemoData());
  },
} satisfies ExportedHandler<Env>;
