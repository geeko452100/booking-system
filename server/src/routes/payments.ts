import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db.js';
import { audit } from '../lib/audit.js';
import { isStaff, requireRole } from '../lib/auth.js';
import { HttpError, parseId } from '../lib/http.js';

export const paymentsRouter = Router();

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

function queryPayments(req: Parameters<typeof isStaff>[0]) {
  const q = filterSchema.parse(req.query);
  const where: string[] = [];
  const params: unknown[] = [];
  const clientId = isStaff(req) ? q.clientId : req.user!.id;
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
  return db
    .prepare(`${PAYMENT_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY p.paid_at DESC LIMIT 2000`)
    .all(...params) as Record<string, unknown>[];
}

paymentsRouter.get('/', (req, res) => {
  res.json(queryPayments(req));
});

paymentsRouter.get('/export.csv', requireRole('admin', 'staff'), (req, res) => {
  const rows = queryPayments(req);
  const cols = ['id', 'paidAt', 'clientName', 'serviceName', 'amountCents', 'method', 'status', 'reference', 'recordedByName'];
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v);
    // Prefix formula-like cells so spreadsheets don't execute them.
    const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
    return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const csv = [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
  audit(req, 'export_payments', 'payment', null, { rows: rows.length });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="payments-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(csv);
});

paymentsRouter.post('/', requireRole('admin', 'staff'), (req, res) => {
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
    .parse(req.body);

  const client = db.prepare(`SELECT id FROM users WHERE id = ? AND role = 'client'`).get(b.clientId);
  if (!client) throw new HttpError(400, 'Unknown client');
  if (b.appointmentId) {
    const appt = db.prepare('SELECT client_id FROM appointments WHERE id = ?').get(b.appointmentId) as
      | { client_id: number }
      | undefined;
    if (!appt || appt.client_id !== b.clientId) throw new HttpError(400, 'Appointment does not belong to this client');
  }

  const info = db
    .prepare(
      `INSERT INTO payments (client_id, appointment_id, amount_cents, method, status, reference, recorded_by, paid_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      b.clientId,
      b.appointmentId ?? null,
      b.amountCents,
      b.method,
      b.status,
      b.reference || null,
      req.user!.id,
      b.paidAt ?? new Date().toISOString(),
    );
  const id = Number(info.lastInsertRowid);
  audit(req, 'record_payment', 'payment', id, { clientId: b.clientId, amountCents: b.amountCents });
  res.status(201).json(db.prepare(`${PAYMENT_SELECT} WHERE p.id = ?`).get(id));
});

paymentsRouter.patch('/:id/status', requireRole('admin', 'staff'), (req, res) => {
  const id = parseId(req.params.id);
  const { status } = z.object({ status: statusSchema }).parse(req.body);
  const current = db.prepare('SELECT status FROM payments WHERE id = ?').get(id) as { status: string } | undefined;
  if (!current) throw new HttpError(404, 'Payment not found');
  if (status === 'refunded' && req.user!.role !== 'admin') throw new HttpError(403, 'Only administrators can issue refunds');
  if (current.status === 'refunded') throw new HttpError(400, 'Refunded payments cannot be changed');

  db.prepare('UPDATE payments SET status = ? WHERE id = ?').run(status, id);
  audit(req, status === 'refunded' ? 'refund_payment' : 'update_payment_status', 'payment', id, {
    from: current.status,
    to: status,
  });
  res.json(db.prepare(`${PAYMENT_SELECT} WHERE p.id = ?`).get(id));
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

const APPOINTMENT_SELECT_FOR_CHECKOUT = `
  SELECT a.status, sv.price_cents AS priceCents,
         (SELECT COALESCE(SUM(p.amount_cents), 0) FROM payments p
            WHERE p.appointment_id = a.id AND p.status = 'paid') AS paidCents
  FROM appointments a JOIN services sv ON sv.id = a.service_id`;

paymentsRouter.post('/checkout', requireRole('client'), (req, res) => {
  const b = z
    .object({
      appointmentId: z.number().int(),
      cardNumber: z.string().max(30),
      expiry: z.string().regex(/^(0[1-9]|1[0-2])\/\d{2}$/, 'use MM/YY'),
      cvc: z.string().regex(/^\d{3,4}$/, 'must be 3 or 4 digits'),
    })
    .parse(req.body);

  const cardNumber = b.cardNumber.replace(/[\s-]/g, '');
  const outcome = TEST_CARDS[cardNumber];
  if (!outcome) {
    throw new HttpError(400, 'Only test cards are accepted on this site. Use 4242 4242 4242 4242.');
  }
  const [mm, yy] = b.expiry.split('/').map(Number);
  if (new Date(2000 + yy, mm, 1) <= new Date()) throw new HttpError(400, 'This card has expired');

  const appt = db
    .prepare(`${APPOINTMENT_SELECT_FOR_CHECKOUT} WHERE a.id = ? AND a.client_id = ?`)
    .get(b.appointmentId, req.user!.id) as { status: string; priceCents: number; paidCents: number } | undefined;
  if (!appt) throw new HttpError(404, 'Appointment not found');
  if (appt.status === 'cancelled' || appt.status === 'no_show') {
    throw new HttpError(400, 'This appointment cannot be paid online');
  }
  const amount = appt.priceCents - appt.paidCents;
  if (amount <= 0) throw new HttpError(400, 'This appointment is already paid');

  const approved = outcome === 'approve';
  const reference = `TEST-${cardNumber.slice(-4)}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  const info = db
    .prepare(
      `INSERT INTO payments (client_id, appointment_id, amount_cents, method, status, reference, recorded_by, paid_at)
       VALUES (?, ?, ?, 'card', ?, ?, ?, ?)`,
    )
    .run(req.user!.id, b.appointmentId, amount, approved ? 'paid' : 'failed', reference, req.user!.id, new Date().toISOString());
  const id = Number(info.lastInsertRowid);
  audit(req, approved ? 'online_payment' : 'online_payment_declined', 'payment', id, { amountCents: amount, testMode: true });

  if (!approved) throw new HttpError(402, 'Your card was declined (test card 4000 0000 0000 0002). No money was taken.');
  res.status(201).json(db.prepare(`${PAYMENT_SELECT} WHERE p.id = ?`).get(id));
});
