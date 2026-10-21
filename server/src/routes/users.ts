import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { all, one, run } from '../db.js';
import { audit } from '../lib/audit.js';
import { requireRole, type AppEnv, type Role } from '../lib/auth.js';
import { isProtectedDemoAccount } from '../lib/demo.js';
import { HttpError, parseId } from '../lib/http.js';
import { hashPassword } from '../lib/password.js';
import type { BusinessType } from '../lib/business.js';
import { findUser, publicUser, tempPassword, type UserRow } from '../lib/users.js';
import { APPOINTMENT_SELECT } from './appointments.js';
import { DOCUMENT_SELECT } from './documents.js';
import { PROJECT_SELECT } from './projects.js';
import { PAYMENT_SELECT } from './payments.js';

/** Account management for staff and admins. Staff manage client accounts; admins manage everyone. */
export const usersRouter = new Hono<AppEnv>();
usersRouter.use(requireRole('admin', 'staff'));

const roleSchema = z.enum(['admin', 'staff', 'client']);
const DEMO_LOCKED = 'This is a shared demo account, so its sign-in details, role and status are protected. Try this on another account.';

async function loadUser(biz: BusinessType, id: number) {
  const user = await findUser(biz, id);
  if (!user) throw new HttpError(404, 'Account not found');
  return user;
}

/** Saves a team member's job title for one business; their photo there is left as it is. */
const saveTitle = (biz: BusinessType, userId: number, title: string | null) =>
  run(
    `INSERT INTO staff_profiles (user_id, biz, title) VALUES (?, ?, ?)
     ON CONFLICT (user_id, biz) DO UPDATE SET title = excluded.title`,
    userId, biz, title,
  );

function assertCanManage(c: Context<AppEnv>, target: UserRow) {
  if (c.get('user').role === 'admin') return;
  if (target.role !== 'client') throw new HttpError(403, 'Only administrators can manage staff accounts');
}

usersRouter.get('/', async (c) => {
  const q = z
    .object({
      role: roleSchema.optional(),
      status: z.enum(['active', 'inactive', 'locked']).optional(),
      q: z.string().trim().optional(),
    })
    .parse(c.req.query());

  const biz = c.get('biz');
  const roles: Role[] = c.get('user').role === 'admin' ? (q.role ? [q.role] : ['admin', 'staff', 'client']) : ['client'];
  const now = new Date().toISOString();
  const where = [`u.role IN (${roles.map(() => '?').join(',')})`];
  const params: (string | number)[] = [...roles];

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

  const rows = await all<UserRow & { appointment_count: number; next_appointment: string | null; total_paid_cents: number }>(
    `SELECT u.*, sp.title, sp.photo,
       (SELECT COUNT(*) FROM appointments a WHERE a.biz = ?1 AND a.client_id = u.id) AS appointment_count,
       (SELECT MIN(a.start_at) FROM appointments a
          WHERE a.biz = ?1 AND a.client_id = u.id AND a.status = 'scheduled' AND a.start_at >= ?2) AS next_appointment,
       (SELECT COALESCE(SUM(p.amount_cents), 0) FROM payments p
          WHERE p.biz = ?1 AND p.client_id = u.id AND p.status = 'paid') AS total_paid_cents
     FROM users u
     LEFT JOIN staff_profiles sp ON sp.user_id = u.id AND sp.biz = ?1
     WHERE ${where.join(' AND ')}
     ORDER BY u.name COLLATE NOCASE`,
    biz,
    now,
    ...params,
  );

  return c.json(
    rows.map((r) => ({
      ...publicUser(r),
      appointmentCount: r.appointment_count,
      nextAppointment: r.next_appointment,
      totalPaidCents: r.total_paid_cents,
    })),
  );
});

usersRouter.get('/:id', async (c) => {
  const biz = c.get('biz');
  const user = await loadUser(biz, parseId(c.req.param('id')));
  assertCanManage(c, user);

  const [appointments, payments, activity, projects, documents] = await Promise.all([
    all(`${APPOINTMENT_SELECT} WHERE a.biz = ? AND a.client_id = ? ORDER BY a.start_at DESC`, biz, user.id),
    all(`${PAYMENT_SELECT} WHERE p.biz = ? AND p.client_id = ? ORDER BY p.paid_at DESC`, biz, user.id),
    all(
      `SELECT l.id, l.action, l.details, l.ip, l.created_at AS createdAt, a.name AS actorName
       FROM audit_log l LEFT JOIN users a ON a.id = l.actor_id
       WHERE l.entity = 'user' AND l.entity_id = ?
       ORDER BY l.id DESC LIMIT 25`,
      user.id,
    ),
    all(`${PROJECT_SELECT} WHERE m.biz = ? AND m.client_id = ? ORDER BY m.stage = 'done', m.updated_at DESC`, biz, user.id),
    all(`${DOCUMENT_SELECT} WHERE d.biz = ? AND d.client_id = ? ORDER BY COALESCE(d.uploaded_at, d.created_at) DESC`, biz, user.id),
  ]);
  return c.json({ user: publicUser(user), appointments, payments, activity, projects, documents });
});

usersRouter.post('/', async (c) => {
  const body = z
    .object({
      name: z.string().trim().min(1).max(100),
      email: z.string().trim().toLowerCase().email(),
      phone: z.string().trim().max(30).optional(),
      notes: z.string().max(2000).optional(),
      title: z.string().trim().max(100).optional(),
      role: roleSchema.default('client'),
    })
    .parse(await c.req.json());
  if (body.role !== 'client' && c.get('user').role !== 'admin') {
    throw new HttpError(403, 'Only administrators can create staff accounts');
  }

  const password = tempPassword();
  const { id } = await run(
    `INSERT INTO users (email, password_hash, name, phone, notes, role, must_change_password) VALUES (?, ?, ?, ?, ?, ?, 1)`,
    body.email,
    await hashPassword(password),
    body.name,
    body.phone || null,
    body.notes || null,
    body.role,
  );
  if (body.role !== 'client' && body.title) await saveTitle(c.get('biz'), id, body.title);
  await audit(c, 'create_account', 'user', id, { role: body.role });
  return c.json({ user: publicUser(await loadUser(c.get('biz'), id)), temporaryPassword: password }, 201);
});

usersRouter.patch('/:id', async (c) => {
  const biz = c.get('biz');
  const user = await loadUser(biz, parseId(c.req.param('id')));
  assertCanManage(c, user);
  const body = z
    .object({
      name: z.string().trim().min(1).max(100).optional(),
      email: z.string().trim().toLowerCase().email().optional(),
      phone: z.string().trim().max(30).nullable().optional(),
      notes: z.string().max(2000).nullable().optional(),
      title: z.string().trim().max(100).nullable().optional(),
      role: roleSchema.optional(),
      isActive: z.boolean().optional(),
    })
    .parse(await c.req.json());

  const me = c.get('user');
  if (
    isProtectedDemoAccount(user.email) &&
    ((body.email !== undefined && body.email !== user.email.toLowerCase()) ||
      (body.role !== undefined && body.role !== user.role) ||
      body.isActive === false)
  ) {
    throw new HttpError(403, DEMO_LOCKED);
  }
  if ((body.role !== undefined || body.isActive !== undefined) && me.role !== 'admin') {
    throw new HttpError(403, 'Only administrators can change roles or account status');
  }
  if (user.id === me.id && (body.isActive === false || (body.role && body.role !== user.role))) {
    throw new HttpError(400, 'You cannot deactivate or change the role of your own account');
  }

  await run(
    'UPDATE users SET name = ?, email = ?, phone = ?, notes = ?, role = ?, is_active = ? WHERE id = ?',
    body.name ?? user.name,
    body.email ?? user.email,
    body.phone !== undefined ? body.phone || null : user.phone,
    body.notes !== undefined ? body.notes || null : user.notes,
    body.role ?? user.role,
    body.isActive === undefined ? user.is_active : Number(body.isActive),
    user.id,
  );
  if (body.title !== undefined) await saveTitle(biz, user.id, body.title || null);

  const action = body.isActive === false ? 'deactivate_account' : body.isActive === true ? 'activate_account' : 'update_account';
  await audit(c, action, 'user', user.id, { fields: Object.keys(body) });
  return c.json(publicUser(await loadUser(biz, user.id)));
});

usersRouter.post('/:id/reset-password', async (c) => {
  const user = await loadUser(c.get('biz'), parseId(c.req.param('id')));
  assertCanManage(c, user);
  if (isProtectedDemoAccount(user.email)) throw new HttpError(403, DEMO_LOCKED);
  const password = tempPassword();
  await run(
    'UPDATE users SET password_hash = ?, must_change_password = 1, failed_logins = 0, locked_until = NULL WHERE id = ?',
    await hashPassword(password),
    user.id,
  );
  await audit(c, 'reset_password', 'user', user.id);
  return c.json({ temporaryPassword: password });
});

usersRouter.post('/:id/unlock', async (c) => {
  const user = await loadUser(c.get('biz'), parseId(c.req.param('id')));
  assertCanManage(c, user);
  await run('UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = ?', user.id);
  await audit(c, 'unlock_account', 'user', user.id);
  return c.json(publicUser(await loadUser(c.get('biz'), user.id)));
});
