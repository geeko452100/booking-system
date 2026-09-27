import bcrypt from 'bcryptjs';
import { Router, type Request } from 'express';
import { z } from 'zod';
import { db } from '../db.js';
import { audit } from '../lib/audit.js';
import { requireRole, type Role } from '../lib/auth.js';
import { isProtectedDemoAccount } from '../lib/demo.js';
import { HttpError, parseId } from '../lib/http.js';
import { BCRYPT_ROUNDS, publicUser, tempPassword, type UserRow } from '../lib/users.js';
import { APPOINTMENT_SELECT } from './appointments.js';
import { PAYMENT_SELECT } from './payments.js';

/** Account management for staff and admins. Staff manage client accounts; admins manage everyone. */
export const usersRouter = Router();
usersRouter.use(requireRole('admin', 'staff'));

const roleSchema = z.enum(['admin', 'staff', 'client']);

function loadUser(id: number) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
  if (!user) throw new HttpError(404, 'Account not found');
  return user;
}

const DEMO_LOCKED = 'This is a shared demo account, so its sign-in details, role and status are protected. Try this on another account.';

function assertCanManage(req: Request, target: UserRow) {
  if (req.user!.role === 'admin') return;
  if (target.role !== 'client') throw new HttpError(403, 'Only administrators can manage staff accounts');
}

usersRouter.get('/', (req, res) => {
  const q = z
    .object({
      role: roleSchema.optional(),
      status: z.enum(['active', 'inactive', 'locked']).optional(),
      q: z.string().trim().optional(),
    })
    .parse(req.query);

  const roles: Role[] = req.user!.role === 'admin' ? (q.role ? [q.role] : ['admin', 'staff', 'client']) : ['client'];
  const now = new Date().toISOString();
  const where = [`u.role IN (${roles.map(() => '?').join(',')})`];
  const params: unknown[] = [...roles];

  if (q.q) {
    where.push('(u.name LIKE ? OR u.email LIKE ? OR u.phone LIKE ?)');
    const like = `%${q.q}%`;
    params.push(like, like, like);
  }
  if (q.status === 'active') where.push('u.is_active = 1');
  if (q.status === 'inactive') where.push('u.is_active = 0');
  if (q.status === 'locked') {
    where.push('u.locked_until > ?');
    params.push(now);
  }

  const rows = db
    .prepare(
      `SELECT u.*,
         (SELECT COUNT(*) FROM appointments a WHERE a.client_id = u.id) AS appointment_count,
         (SELECT MIN(a.start_at) FROM appointments a
            WHERE a.client_id = u.id AND a.status = 'scheduled' AND a.start_at >= ?) AS next_appointment,
         (SELECT COALESCE(SUM(p.amount_cents), 0) FROM payments p
            WHERE p.client_id = u.id AND p.status = 'paid') AS total_paid_cents
       FROM users u
       WHERE ${where.join(' AND ')}
       ORDER BY u.name COLLATE NOCASE`,
    )
    .all(now, ...params) as (UserRow & { appointment_count: number; next_appointment: string | null; total_paid_cents: number })[];

  res.json(
    rows.map((r) => ({
      ...publicUser(r),
      appointmentCount: r.appointment_count,
      nextAppointment: r.next_appointment,
      totalPaidCents: r.total_paid_cents,
    })),
  );
});

usersRouter.get('/:id', (req, res) => {
  const user = loadUser(parseId(req.params.id));
  assertCanManage(req, user);

  const appointments = db
    .prepare(`${APPOINTMENT_SELECT} WHERE a.client_id = ? ORDER BY a.start_at DESC`)
    .all(user.id);
  const payments = db.prepare(`${PAYMENT_SELECT} WHERE p.client_id = ? ORDER BY p.paid_at DESC`).all(user.id);
  const activity = db
    .prepare(
      `SELECT l.id, l.action, l.details, l.ip, l.created_at AS createdAt, a.name AS actorName
       FROM audit_log l LEFT JOIN users a ON a.id = l.actor_id
       WHERE l.entity = 'user' AND l.entity_id = ?
       ORDER BY l.id DESC LIMIT 25`,
    )
    .all(user.id);

  res.json({ user: publicUser(user), appointments, payments, activity });
});

usersRouter.post('/', (req, res) => {
  const body = z
    .object({
      name: z.string().trim().min(1).max(100),
      email: z.string().trim().toLowerCase().email(),
      phone: z.string().trim().max(30).optional(),
      notes: z.string().max(2000).optional(),
      role: roleSchema.default('client'),
    })
    .parse(req.body);
  if (body.role !== 'client' && req.user!.role !== 'admin') {
    throw new HttpError(403, 'Only administrators can create staff accounts');
  }

  const password = tempPassword();
  const info = db
    .prepare(
      `INSERT INTO users (email, password_hash, name, phone, notes, role, must_change_password)
       VALUES (?, ?, ?, ?, ?, ?, 1)`,
    )
    .run(body.email, bcrypt.hashSync(password, BCRYPT_ROUNDS), body.name, body.phone || null, body.notes || null, body.role);
  const id = Number(info.lastInsertRowid);
  audit(req, 'create_account', 'user', id, { role: body.role });
  res.status(201).json({ user: publicUser(loadUser(id)), temporaryPassword: password });
});

usersRouter.patch('/:id', (req, res) => {
  const user = loadUser(parseId(req.params.id));
  assertCanManage(req, user);
  const body = z
    .object({
      name: z.string().trim().min(1).max(100).optional(),
      email: z.string().trim().toLowerCase().email().optional(),
      phone: z.string().trim().max(30).nullable().optional(),
      notes: z.string().max(2000).nullable().optional(),
      role: roleSchema.optional(),
      isActive: z.boolean().optional(),
    })
    .parse(req.body);

  const isAdmin = req.user!.role === 'admin';
  if (
    isProtectedDemoAccount(user.email) &&
    ((body.email !== undefined && body.email !== user.email.toLowerCase()) ||
      (body.role !== undefined && body.role !== user.role) ||
      body.isActive === false)
  ) {
    throw new HttpError(403, DEMO_LOCKED);
  }
  if ((body.role !== undefined || body.isActive !== undefined) && !isAdmin) {
    throw new HttpError(403, 'Only administrators can change roles or account status');
  }
  if (user.id === req.user!.id && (body.isActive === false || (body.role && body.role !== user.role))) {
    throw new HttpError(400, 'You cannot deactivate or change the role of your own account');
  }

  const next = {
    name: body.name ?? user.name,
    email: body.email ?? user.email,
    phone: body.phone !== undefined ? body.phone || null : user.phone,
    notes: body.notes !== undefined ? body.notes || null : user.notes,
    role: body.role ?? user.role,
    is_active: body.isActive === undefined ? user.is_active : Number(body.isActive),
  };
  db.prepare(
    'UPDATE users SET name = @name, email = @email, phone = @phone, notes = @notes, role = @role, is_active = @is_active WHERE id = @id',
  ).run({ ...next, id: user.id });

  const changed = Object.keys(body);
  const action =
    body.isActive === false ? 'deactivate_account' : body.isActive === true ? 'activate_account' : 'update_account';
  audit(req, action, 'user', user.id, { fields: changed });
  res.json(publicUser(loadUser(user.id)));
});

usersRouter.post('/:id/reset-password', (req, res) => {
  const user = loadUser(parseId(req.params.id));
  assertCanManage(req, user);
  if (isProtectedDemoAccount(user.email)) throw new HttpError(403, DEMO_LOCKED);
  const password = tempPassword();
  db.prepare(
    'UPDATE users SET password_hash = ?, must_change_password = 1, failed_logins = 0, locked_until = NULL WHERE id = ?',
  ).run(bcrypt.hashSync(password, BCRYPT_ROUNDS), user.id);
  audit(req, 'reset_password', 'user', user.id);
  res.json({ temporaryPassword: password });
});

usersRouter.post('/:id/unlock', (req, res) => {
  const user = loadUser(parseId(req.params.id));
  assertCanManage(req, user);
  db.prepare('UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = ?').run(user.id);
  audit(req, 'unlock_account', 'user', user.id);
  res.json(publicUser(loadUser(user.id)));
});
