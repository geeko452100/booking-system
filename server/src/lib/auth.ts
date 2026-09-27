import { env } from 'cloudflare:workers';
import type { Context, MiddlewareHandler } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { sign, verify } from 'hono/jwt';
import { one, scalar } from '../db.js';
import { HttpError } from './http.js';

export type Role = 'admin' | 'staff' | 'client';

export interface AuthUser {
  id: number;
  role: Role;
  name: string;
  email: string;
}

export type AppEnv = { Variables: { user: AuthUser } };

const COOKIE = 'session';
const SESSION_HOURS = 8;

function secret() {
  if (!env.JWT_SECRET) throw new HttpError(500, 'Server is missing JWT_SECRET. See README → Deploying.');
  return env.JWT_SECRET;
}

// Local `wrangler dev` runs on plain http, where a Secure cookie would be dropped by some browsers.
const cookieOptions = (c: Context) =>
  ({ httpOnly: true, sameSite: 'Strict', secure: new URL(c.req.url).protocol === 'https:', path: '/' }) as const;

/** Changes whenever the demo data is reset; sessions from before a reset are rejected. */
const currentEpoch = async () => (await scalar<string>(`SELECT value AS v FROM meta WHERE key = 'data_epoch'`)) ?? '';

export async function setSession(c: Context, userId: number) {
  const exp = Math.floor(Date.now() / 1000) + SESSION_HOURS * 3600;
  const token = await sign({ sub: String(userId), ep: await currentEpoch(), exp }, secret(), 'HS256');
  setCookie(c, COOKIE, token, { ...cookieOptions(c), maxAge: SESSION_HOURS * 3600 });
}

export function clearSession(c: Context) {
  deleteCookie(c, COOKIE, cookieOptions(c));
}

/**
 * Verifies the session cookie and re-reads the user on every request, so deactivating an account
 * or changing its role takes effect immediately.
 */
export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const token = getCookie(c, COOKIE);
  if (!token) return c.json({ error: 'Not signed in' }, 401);

  let payload: { sub?: unknown; ep?: unknown };
  try {
    payload = (await verify(token, secret(), 'HS256')) as typeof payload;
  } catch {
    clearSession(c);
    return c.json({ error: 'Session expired, please sign in again' }, 401);
  }

  // One query: the current epoch plus the user, if they still exist.
  const row = await one<{ epoch: string | null } & Partial<AuthUser> & { is_active: number | null }>(
    `SELECT (SELECT value FROM meta WHERE key = 'data_epoch') AS epoch, u.id, u.role, u.name, u.email, u.is_active
     FROM (SELECT 1) LEFT JOIN users u ON u.id = ?`,
    Number(payload.sub),
  );
  if (!row || payload.ep !== (row.epoch ?? '')) {
    clearSession(c);
    return c.json({ error: 'The demo data was just reset. Please sign in again.' }, 401);
  }
  if (!row.id || !row.is_active) {
    clearSession(c);
    return c.json({ error: 'Session is no longer valid' }, 401);
  }
  c.set('user', { id: row.id, role: row.role!, name: row.name!, email: row.email! });
  await next();
};

export const requireRole =
  (...roles: Role[]): MiddlewareHandler<AppEnv> =>
  async (c, next) => {
    if (!roles.includes(c.get('user').role)) return c.json({ error: 'You do not have access to this' }, 403);
    await next();
  };

export const isStaff = (c: Context<AppEnv>) => c.get('user').role !== 'client';

/** Per-IP limit on sign-in and sign-up, using the Workers rate limiting binding. */
export const authRateLimit: MiddlewareHandler = async (c, next) => {
  const ip = c.req.header('cf-connecting-ip') ?? 'unknown';
  const { success } = await env.AUTH_LIMITER.limit({ key: ip });
  if (!success) return c.json({ error: 'Too many attempts. Please wait a minute and try again.' }, 429);
  await next();
};
