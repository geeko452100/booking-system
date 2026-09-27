import crypto from 'node:crypto';
import { isProtectedDemoAccount } from './demo.js';

export interface UserRow {
  id: number;
  email: string;
  password_hash: string;
  name: string;
  phone: string | null;
  role: 'admin' | 'staff' | 'client';
  is_active: number;
  failed_logins: number;
  locked_until: string | null;
  must_change_password: number;
  last_login_at: string | null;
  notes: string | null;
  created_at: string;
}

export function publicUser(u: UserRow) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    phone: u.phone,
    role: u.role,
    isActive: !!u.is_active,
    isLocked: !!u.locked_until && u.locked_until > new Date().toISOString(),
    lockedUntil: u.locked_until,
    failedLogins: u.failed_logins,
    mustChangePassword: !!u.must_change_password,
    lastLoginAt: u.last_login_at,
    notes: u.notes,
    createdAt: u.created_at,
    isDemoAccount: isProtectedDemoAccount(u.email),
  };
}

/** Readable temporary password, e.g. "Kq7m-Xp2d-Rw9t". */
export function tempPassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(12);
  const chars = Array.from(bytes, (b) => alphabet[b % alphabet.length]);
  return [0, 4, 8].map((i) => chars.slice(i, i + 4).join('')).join('-');
}

export const BCRYPT_ROUNDS = 11;
