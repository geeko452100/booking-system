import crypto from 'node:crypto';

const DEV_SECRET = 'dev-only-change-me';
const demoMode = process.env.DEMO_MODE === '1';

export const config = {
  port: Number(process.env.PORT ?? 4000),
  // Demo sessions are thrown away at every data reset anyway, so a per-process secret is fine there.
  jwtSecret: process.env.JWT_SECRET ?? (demoMode ? crypto.randomBytes(32).toString('hex') : DEV_SECRET),
  dbFile: process.env.DB_FILE ?? 'data/booking.db',
  isProd: process.env.NODE_ENV === 'production',
  demoMode,
  demoResetMinutes: Math.max(5, Number(process.env.DEMO_RESET_MINUTES ?? 60)),
  sessionHours: 8,
  maxFailedLogins: 5,
  lockMinutes: 15,
};

if (config.isProd && config.jwtSecret === DEV_SECRET) {
  throw new Error('JWT_SECRET must be set in production (or run with DEMO_MODE=1)');
}
