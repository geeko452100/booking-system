import { Hono } from 'hono';
import { z } from 'zod';
import { one, run } from '../db.js';
import { audit } from '../lib/audit.js';
import { authRateLimit, clearSession, requireAuth, setSession, type AppEnv } from '../lib/auth.js';
import { isProtectedDemoAccount } from '../lib/demo.js';
import { HttpError } from '../lib/http.js';
import { DUMMY_HASH, hashPassword, verifyPassword } from '../lib/password.js';
import { publicUser, type UserRow } from '../lib/users.js';

const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;

export const authRouter = new Hono<AppEnv>();

const password = z.string().min(8, 'must be at least 8 characters').max(128);
const loadUser = (id: number) => one<UserRow>('SELECT * FROM users WHERE id = ?', id) as Promise<UserRow>;

authRouter.post('/login', authRateLimit, async (c) => {
  const { email, password: pw } = z
    .object({ email: z.string().trim().email(), password: z.string().min(1) })
    .parse(await c.req.json());

  const user = await one<UserRow>('SELECT * FROM users WHERE email = ?', email);
  const now = new Date();

  if (!user) {
    await verifyPassword(pw, DUMMY_HASH);
    throw new HttpError(401, 'Incorrect email or password');
  }
  if (user.locked_until && user.locked_until > now.toISOString()) {
    await audit(c, 'login_blocked_locked', 'user', user.id, undefined, user.id);
    throw new HttpError(423, 'This account is temporarily locked after too many failed attempts. Try again later or contact staff.');
  }
  if (!user.is_active) {
    await audit(c, 'login_blocked_inactive', 'user', user.id, undefined, user.id);
    throw new HttpError(403, 'This account has been deactivated. Please contact staff.');
  }

  if (!(await verifyPassword(pw, user.password_hash))) {
    // Shared demo logins never lock, or one visitor's typos would lock out everyone else.
    if (isProtectedDemoAccount(user.email)) {
      await audit(c, 'login_failed', 'user', user.id, undefined, user.id);
      throw new HttpError(401, 'Incorrect email or password');
    }
    const failed = user.failed_logins + 1;
    const lockedUntil = failed >= MAX_FAILED_LOGINS ? new Date(now.getTime() + LOCK_MINUTES * 60_000).toISOString() : null;
    await run('UPDATE users SET failed_logins = ?, locked_until = ? WHERE id = ?', lockedUntil ? 0 : failed, lockedUntil, user.id);
    await audit(c, lockedUntil ? 'account_locked' : 'login_failed', 'user', user.id, { attempt: failed }, user.id);
    throw new HttpError(401, 'Incorrect email or password');
  }

  await run('UPDATE users SET failed_logins = 0, locked_until = NULL, last_login_at = ? WHERE id = ?', now.toISOString(), user.id);
  await audit(c, 'login', 'user', user.id, undefined, user.id);
  await setSession(c, user.id);
  return c.json(publicUser({ ...user, failed_logins: 0, locked_until: null, last_login_at: now.toISOString() }));
});

authRouter.post('/register', authRateLimit, async (c) => {
  const body = z
    .object({
      name: z.string().trim().min(1).max(100),
      email: z.string().trim().toLowerCase().email(),
      phone: z.string().trim().max(30).optional(),
      password,
    })
    .parse(await c.req.json());

  if (await one('SELECT 1 FROM users WHERE email = ?', body.email)) {
    throw new HttpError(409, 'An account with this email already exists');
  }
  const { id } = await run(
    `INSERT INTO users (email, password_hash, name, phone, role, last_login_at) VALUES (?, ?, ?, ?, 'client', ?)`,
    body.email,
    await hashPassword(body.password),
    body.name,
    body.phone || null,
    new Date().toISOString(),
  );
  await audit(c, 'register', 'user', id, undefined, id);
  await setSession(c, id);
  return c.json(publicUser(await loadUser(id)), 201);
});

authRouter.post('/logout', (c) => {
  clearSession(c);
  return c.body(null, 204);
});

authRouter.get('/me', requireAuth, async (c) => c.json(publicUser(await loadUser(c.get('user').id))));

authRouter.patch('/me', requireAuth, async (c) => {
  const body = z
    .object({ name: z.string().trim().min(1).max(100), phone: z.string().trim().max(30).nullable().optional() })
    .parse(await c.req.json());
  const id = c.get('user').id;
  await run('UPDATE users SET name = ?, phone = ? WHERE id = ?', body.name, body.phone || null, id);
  await audit(c, 'update_profile', 'user', id);
  return c.json(publicUser(await loadUser(id)));
});

authRouter.post('/me/password', requireAuth, async (c) => {
  const body = z.object({ currentPassword: z.string().min(1), newPassword: password }).parse(await c.req.json());
  const user = await loadUser(c.get('user').id);
  if (isProtectedDemoAccount(user.email)) {
    throw new HttpError(403, "This is a shared demo account, so its password can't be changed. Create your own account to try this.");
  }
  if (!(await verifyPassword(body.currentPassword, user.password_hash))) {
    throw new HttpError(400, 'Current password is incorrect');
  }
  await run('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?', await hashPassword(body.newPassword), user.id);
  await audit(c, 'change_password', 'user', user.id);
  return c.body(null, 204);
});
