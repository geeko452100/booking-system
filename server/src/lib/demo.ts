import { env } from 'cloudflare:workers';
import { scalar } from '../db.js';
import { buildSeedSql, DEMO_ACCOUNTS } from '../seed-data.js';

export const demoMode = () => String(env.DEMO_MODE) === '1';
const resetMinutes = () => Math.max(5, Number(env.DEMO_RESET_MINUTES) || 60);
const protectedEmails = new Set(DEMO_ACCOUNTS.map((a) => a.email));

/** In demo mode the advertised logins can't be locked, reset, deactivated or re-emailed by visitors. */
export const isProtectedDemoAccount = (email: string) => demoMode() && protectedEmails.has(email.toLowerCase());

/** Wipes the database and loads fresh demo data in one atomic batch. Also signs everyone out. */
export async function resetDemoData() {
  const { statements, counts } = buildSeedSql({
    epoch: crypto.randomUUID(),
    timeZone: env.DEMO_TIMEZONE || undefined,
  });
  await env.DB.batch(statements.map((s) => env.DB.prepare(s)));
  console.log(`demo data reset: ${counts.users} users, ${counts.appointments} appointments, ${counts.payments} payments`);
}

let seededCheck: Promise<void> | null = null;

/** Loads demo data if the database is empty (first request after deploying). Checked once per isolate. */
export function ensureSeeded() {
  seededCheck ??= (async () => {
    if (!(await scalar(`SELECT EXISTS (SELECT 1 FROM users) AS v`))) await resetDemoData();
  })().catch((err) => {
    seededCheck = null;
    throw err;
  });
  return seededCheck;
}

export async function demoStatus() {
  if (!demoMode()) return { demoMode: false };
  // The cron schedule fires on UTC boundaries of the interval (e.g. every hour on the hour).
  const step = resetMinutes() * 60_000;
  return {
    demoMode: true,
    resetMinutes: resetMinutes(),
    nextResetAt: new Date(Math.ceil((Date.now() + 1) / step) * step).toISOString(),
    accounts: DEMO_ACCOUNTS,
  };
}
