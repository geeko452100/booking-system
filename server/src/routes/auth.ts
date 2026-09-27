import bcrypt from 'bcryptjs';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { config } from '../config.js';
import { db } from '../db.js';
import { audit } from '../lib/audit.js';
import { isProtectedDemoAccount } from '../lib/demo.js';
import { clearSessionCookie, requireAuth, setSessionCookie } from '../lib/auth.js';
import { HttpError } from '../lib/http.js';
import { BCRYPT_ROUNDS, publicUser, type UserRow } from '../lib/users.js';

export const authRouter = Router();

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false });

// Compared against when the email is unknown, so response time doesn't reveal which emails exist.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', BCRYPT_ROUNDS);

const password = z.string().min(8, 'must be at least 8 characters').max(128);

authRouter.post('/login', loginLimiter, (req, res) => {
  const { email, password: pw } = z
    .object({ email: z.string().trim().email(), password: z.string().min(1) })
    .parse(req.body);

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as UserRow | undefined;
  const now = new Date();

  if (!user) {
    bcrypt.compareSync(pw, DUMMY_HASH);
    throw new HttpError(401, 'Incorrect email or password');
  }
  if (user.locked_until && user.locked_until > now.toISOString()) {
    audit(req, 'login_blocked_locked', 'user', user.id, undefined, user.id);
    throw new HttpError(423, 'This account is temporarily locked after too many failed attempts. Try again later or contact staff.');
  }
  if (!user.is_active) {
    audit(req, 'login_blocked_inactive', 'user', user.id, undefined, user.id);
    throw new HttpError(403, 'This account has been deactivated. Please contact staff.');
  }

  if (!bcrypt.compareSync(pw, user.password_hash)) {
    // Shared demo logins never lock, or one visitor's typos would lock out everyone else.
    if (isProtectedDemoAccount(user.email)) {
      audit(req, 'login_failed', 'user', user.id, undefined, user.id);
      throw new HttpError(401, 'Incorrect email or password');
    }
    const failed = user.failed_logins + 1;
    const lockedUntil =
      failed >= config.maxFailedLogins ? new Date(now.getTime() + config.lockMinutes * 60_000).toISOString() : null;
    db.prepare('UPDATE users SET failed_logins = ?, locked_until = ? WHERE id = ?').run(
      lockedUntil ? 0 : failed,
      lockedUntil,
      user.id,
    );
    audit(req, lockedUntil ? 'account_locked' : 'login_failed', 'user', user.id, { attempt: failed }, user.id);
    throw new HttpError(401, 'Incorrect email or password');
  }

  db.prepare('UPDATE users SET failed_logins = 0, locked_until = NULL, last_login_at = ? WHERE id = ?').run(
    now.toISOString(),
    user.id,
  );
  audit(req, 'login', 'user', user.id, undefined, user.id);
  setSessionCookie(res, user.id);
  res.json(publicUser({ ...user, failed_logins: 0, locked_until: null, last_login_at: now.toISOString() }));
});

authRouter.post('/register', loginLimiter, (req, res) => {
  const body = z
    .object({
      name: z.string().trim().min(1).max(100),
      email: z.string().trim().toLowerCase().email(),
      phone: z.string().trim().max(30).optional(),
      password,
    })
    .parse(req.body);

  const exists = db.prepare('SELECT 1 FROM users WHERE email = ?').get(body.email);
  if (exists) throw new HttpError(409, 'An account with this email already exists');

  const now = new Date().toISOString();
  const info = db
    .prepare(
      `INSERT INTO users (email, password_hash, name, phone, role, last_login_at)
       VALUES (?, ?, ?, ?, 'client', ?)`,
    )
    .run(body.email, bcrypt.hashSync(body.password, BCRYPT_ROUNDS), body.name, body.phone || null, now);
  const id = Number(info.lastInsertRowid);
  audit(req, 'register', 'user', id, undefined, id);
  setSessionCookie(res, id);
  res.status(201).json(publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow));
});

authRouter.post('/logout', (req, res) => {
  clearSessionCookie(res);
  res.status(204).end();
});

authRouter.get('/me', requireAuth, (req, res) => {
  res.json(publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(req.user!.id) as UserRow));
});

authRouter.patch('/me', requireAuth, (req, res) => {
  const body = z
    .object({ name: z.string().trim().min(1).max(100), phone: z.string().trim().max(30).nullable().optional() })
    .parse(req.body);
  db.prepare('UPDATE users SET name = ?, phone = ? WHERE id = ?').run(body.name, body.phone || null, req.user!.id);
  audit(req, 'update_profile', 'user', req.user!.id);
  res.json(publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(req.user!.id) as UserRow));
});

authRouter.post('/me/password', requireAuth, (req, res) => {
  const body = z.object({ currentPassword: z.string().min(1), newPassword: password }).parse(req.body);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user!.id) as UserRow;
  if (isProtectedDemoAccount(user.email)) {
    throw new HttpError(403, "This is a shared demo account, so its password can't be changed. Create your own account to try this.");
  }
  if (!bcrypt.compareSync(body.currentPassword, user.password_hash)) {
    throw new HttpError(400, 'Current password is incorrect');
  }
  db.prepare('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?').run(
    bcrypt.hashSync(body.newPassword, BCRYPT_ROUNDS),
    user.id,
  );
  audit(req, 'change_password', 'user', user.id);
  res.status(204).end();
});
