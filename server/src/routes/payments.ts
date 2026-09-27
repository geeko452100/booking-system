import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { all, one, run } from '../db.js';
import { audit } from '../lib/audit.js';
import { isStaff, requireRole, type AppEnv } from '../lib/auth.js';
import { HttpError, parseId } from '../lib/http.js';

export const paymentsRouter = new Hono<AppEnv>();

export const PAYMENT_SELECT = `
  SELECT p.id, p.client_id AS clientId, c.name AS clientName, p.appointment_id AS appointmentId,
         sv.name AS serviceName, a.start_at AS appointmentStart,
         p.amount_cents AS amountCents, p.method, p.status, p.reference, p.paid_at AS paidAt,
         r.name AS recordedByName, p.created_at AS createdAt
  FROM payments p
  JOIN users c ON c.id = p.client_id
  LEFT JOIN appointments a ON a.id = p.appointment_id
  LEFT JOIN services sv ON sv.id = a.service_id
  LEFT JOIN users r ON r.id = p.recorded_by`;

const methodSchema = z.enum(['card', 'cash', 'bank_transfer', 'other']);
const statusSchema = z.enum(['pending', 'paid', 'refunded', 'failed']);
const isoDate = z.string().datetime({ offset: true }).transform((s) => new Date(s).toISOString());

const filterSchema = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
  status: statusSchema.optional(),
  method: methodSchema.optional(),
  clientId: z.coerce.number().int().optional(),
  q: z.string().trim().optional(),
});

const getPayment = (id: number) => one(`${PAYMENT_SELECT} WHERE p.id = ?`, id);

function queryPayments(c: Context<AppEnv>) {
  const q = filterSchema.parse(c.req.query());
  const where: string[] = [];
  const params: (string | number)[] = [];
  const clientId = isStaff(c) ? q.clientId : c.get('user').id;
  if (clientId) {
    where.push('p.client_id = ?');
    params.push(clientId);
  }
  if (q.from) {
    where.push('p.paid_at >= ?');
    params.push(q.from);
  }
  if (q.to) {
    where.push('p.paid_at < ?');
    params.push(q.to);
  }
  if (q.status) {
    where.push('p.status = ?');
    params.push(q.status);
  }
  if (q.method) {
    where.push('p.method = ?');
    params.push(q.method);
  }
  if (q.q) {
    where.push('(c.name LIKE ? OR p.reference LIKE ?)');
    params.push(`%${q.q}%`, `%${q.q}%`);
  }
  return all<Record<string, unknown>>(
    `${PAYMENT_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY p.paid_at DESC LIMIT 2000`,
    ...params,
  );
}

paymentsRouter.get('/', async (c) => c.json(await queryPayments(c)));

paymentsRouter.get('/export.csv', requireRole('admin', 'staff'), async (c) => {
  const rows = await queryPayments(c);
  const cols = ['id', 'paidAt', 'clientName', 'serviceName', 'amountCents', 'method', 'status', 'reference', 'recordedByName'];
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v);
    // Prefix formula-like cells so spreadsheets don't execute them.
    const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
    return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const csv = [cols.join(','), ...rows.map((r) => cols.map((col) => esc(r[col])).join(','))].join('\n');
  await audit(c, 'export_payments', 'payment', null, { rows: rows.length });
  return c.body(csv, 200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="payments-${new Date().toISOString().slice(0, 10)}.csv"`,
  });
});

paymentsRouter.post('/', requireRole('admin', 'staff'), async (c) => {
  const b = z
    .object({
      clientId: z.number().int(),
      appointmentId: z.number().int().nullable().optional(),
      amountCents: z.number().int().positive(),
      method: methodSchema,
      status: statusSchema.default('paid'),
      reference: z.string().trim().max(100).optional(),
      paidAt: isoDate.optional(),
    })
    .parse(await c.req.json());

  if (!(await one(`SELECT 1 FROM users WHERE id = ? AND role = 'client'`, b.clientId))) throw new HttpError(400, 'Unknown client');
  if (b.appointmentId) {
    const appt = await one<{ client_id: number }>('SELECT client_id FROM appointments WHERE id = ?', b.appointmentId);
    if (!appt || appt.client_id !== b.clientId) throw new HttpError(400, 'Appointment does not belong to this client');
  }

  const { id } = await run(
    `INSERT INTO payments (client_id, appointment_id, amount_cents, method, status, reference, recorded_by, paid_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    b.clientId, b.appointmentId ?? null, b.amountCents, b.method, b.status, b.reference || null,
    c.get('user').id, b.paidAt ?? new Date().toISOString(),
  );
  await audit(c, 'record_payment', 'payment', id, { clientId: b.clientId, amountCents: b.amountCents });
  return c.json(await getPayment(id), 201);
});

paymentsRouter.patch('/:id/status', requireRole('admin', 'staff'), async (c) => {
  const id = parseId(c.req.param('id'));
  const { status } = z.object({ status: statusSchema }).parse(await c.req.json());
  const current = await one<{ status: string }>('SELECT status FROM payments WHERE id = ?', id);
  if (!current) throw new HttpError(404, 'Payment not found');
  if (status === 'refunded' && c.get('user').role !== 'admin') throw new HttpError(403, 'Only administrators can issue refunds');
  if (current.status === 'refunded') throw new HttpError(400, 'Refunded payments cannot be changed');

  await run('UPDATE payments SET status = ? WHERE id = ?', status, id);
  await audit(c, status === 'refunded' ? 'refund_payment' : 'update_payment_status', 'payment', id, { from: current.status, to: status });
  return c.json(await getPayment(id));
});

/**
 * Online checkout for clients. The site runs in test mode: only the published test card
 * numbers are accepted, nothing is charged, and card details are never stored — the
 * reference keeps the last four digits only.
 */
const TEST_CARDS: Record<string, 'approve' | 'decline'> = {
  '4242424242424242': 'approve',
  '5555555555554444': 'approve',
  '4000000000000002': 'decline',
};

const PAID_SO_FAR = `(SELECT COALESCE(SUM(amount_cents), 0) FROM payments WHERE appointment_id = ? AND status = 'paid')`;

paymentsRouter.post('/checkout', requireRole('client'), async (c) => {
  const b = z
    .object({
      appointmentId: z.number().int(),
      cardNumber: z.string().max(30),
      expiry: z.string().regex(/^(0[1-9]|1[0-2])\/\d{2}$/, 'use MM/YY'),
      cvc: z.string().regex(/^\d{3,4}$/, 'must be 3 or 4 digits'),
    })
    .parse(await c.req.json());

  const cardNumber = b.cardNumber.replace(/[\s-]/g, '');
  const outcome = TEST_CARDS[cardNumber];
  if (!outcome) throw new HttpError(400, 'Only test cards are accepted on this site. Use 4242 4242 4242 4242.');
  const [mm, yy] = b.expiry.split('/').map(Number);
  if (new Date(2000 + yy, mm, 1) <= new Date()) throw new HttpError(400, 'This card has expired');

  const me = c.get('user');
  const appt = await one<{ status: string; priceCents: number; paidCents: number }>(
    `SELECT a.status, sv.price_cents AS priceCents, ${PAID_SO_FAR.replace('?', 'a.id')} AS paidCents
     FROM appointments a JOIN services sv ON sv.id = a.service_id
     WHERE a.id = ? AND a.client_id = ?`,
    b.appointmentId,
    me.id,
  );
  if (!appt) throw new HttpError(404, 'Appointment not found');
  if (appt.status === 'cancelled' || appt.status === 'no_show') throw new HttpError(400, 'This appointment cannot be paid online');
  const amount = appt.priceCents - appt.paidCents;
  if (amount <= 0) throw new HttpError(400, 'This appointment is already paid');

  const approved = outcome === 'approve';
  const reference = `TEST-${cardNumber.slice(-4)}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
  // Only insert if nothing was paid in the meantime, so a double-click can't pay twice.
  const { id, changes } = await run(
    `INSERT INTO payments (client_id, appointment_id, amount_cents, method, status, reference, recorded_by, paid_at)
     SELECT ?, ?, ?, 'card', ?, ?, ?, ? WHERE ${PAID_SO_FAR} = ?`,
    me.id, b.appointmentId, amount, approved ? 'paid' : 'failed', reference, me.id, new Date().toISOString(),
    b.appointmentId, appt.paidCents,
  );
  if (!changes) throw new HttpError(409, 'This appointment was just paid');
  await audit(c, approved ? 'online_payment' : 'online_payment_declined', 'payment', id, { amountCents: amount, testMode: true });

  if (!approved) throw new HttpError(402, 'Your card was declined (test card 4000 0000 0000 0002). No money was taken.');
  return c.json(await getPayment(id), 201);
});
