import type { Request, RequestHandler, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { db } from '../db.js';

export type Role = 'admin' | 'staff' | 'client';

export interface AuthUser {
  id: number;
  role: Role;
  name: string;
  email: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

const COOKIE = 'session';

/** Changes whenever the demo data is reset; sessions from before a reset are rejected. */
const currentEpoch = () =>
  (db.prepare(`SELECT value FROM meta WHERE key = 'data_epoch'`).pluck().get() as string | undefined) ?? '';

export function setSessionCookie(res: Response, userId: number) {
  const token = jwt.sign({ sub: String(userId), ep: currentEpoch() }, config.jwtSecret, {
    expiresIn: `${config.sessionHours}h`,
  });
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: config.isProd,
    maxAge: config.sessionHours * 3600 * 1000,
  });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(COOKIE, { httpOnly: true, sameSite: 'strict', secure: config.isProd });
}

/**
 * Verifies the session cookie and re-reads the user on every request so that
 * deactivating an account or changing its role takes effect immediately.
 */
export const requireAuth: RequestHandler = (req, res, next) => {
  const token = req.cookies?.[COOKIE];
  if (!token) {
    res.status(401).json({ error: 'Not signed in' });
    return;
  }
  try {
    const payload = jwt.verify(token, config.jwtSecret) as jwt.JwtPayload;
    if (payload.ep !== currentEpoch()) {
      clearSessionCookie(res);
      res.status(401).json({ error: 'The demo data was just reset. Please sign in again.' });
      return;
    }
    const user = db
      .prepare('SELECT id, role, name, email, is_active FROM users WHERE id = ?')
      .get(Number(payload.sub)) as (AuthUser & { is_active: number }) | undefined;
    if (!user || !user.is_active) {
      clearSessionCookie(res);
      res.status(401).json({ error: 'Session is no longer valid' });
      return;
    }
    req.user = { id: user.id, role: user.role, name: user.name, email: user.email };
    next();
  } catch {
    clearSessionCookie(res);
    res.status(401).json({ error: 'Session expired, please sign in again' });
  }
};

export const requireRole =
  (...roles: Role[]): RequestHandler =>
  (req, res, next) => {
    if (req.user && roles.includes(req.user.role)) return next();
    res.status(403).json({ error: 'You do not have access to this' });
  };

export const isStaff = (req: Request) => req.user?.role === 'admin' || req.user?.role === 'staff';
