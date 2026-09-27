import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db.js';
import { audit } from '../lib/audit.js';
import { isStaff } from '../lib/auth.js';
import { HttpError, parseId } from '../lib/http.js';

export const appointmentsRouter = Router();

export const APPOINTMENT_SELECT = `
  SELECT a.id, a.client_id AS clientId, c.name AS clientName, c.email AS clientEmail,
         a.staff_id AS staffId, st.name AS staffName,
         a.service_id AS serviceId, sv.name AS serviceName, sv.price_cents AS priceCents,
         a.start_at AS startAt, a.end_at AS endAt, a.status, a.notes, a.created_at AS createdAt,
         (SELECT COALESCE(SUM(p.amount_cents), 0) FROM payments p
            WHERE p.appointment_id = a.id AND p.status = 'paid') AS paidCents
  FROM appointments a
  JOIN users c ON c.id = a.client_id
  LEFT JOIN users st ON st.id = a.staff_id
  JOIN services sv ON sv.id = a.service_id`;

interface AppointmentRow {
  id: number;
  client_id: number;
  staff_id: number | null;
  service_id: number;
  start_at: string;
  end_at: string;
  status: string;
  notes: string | null;
}

const statusSchema = z.enum(['scheduled', 'completed', 'cancelled', 'no_show']);
const isoDate = z.string().datetime({ offset: true }).transform((s) => new Date(s).toISOString());

/** Providers a client can pick when booking. */
appointmentsRouter.get('/providers', (_req, res) => {
  res.json(
    db.prepare(`SELECT id, name FROM users WHERE role IN ('staff','admin') AND is_active = 1 ORDER BY name`).all(),
  );
});

appointmentsRouter.get('/', (req, res) => {
  const q = z
    .object({
      from: isoDate.optional(),
      to: isoDate.optional(),
      status: statusSchema.optional(),
      clientId: z.coerce.number().int().optional(),
      q: z.string().trim().optional(),
    })
    .parse(req.query);

  const where: string[] = [];
  const params: unknown[] = [];
  const clientId = isStaff(req) ? q.clientId : req.user!.id;
  if (clientId) {
    where.push('a.client_id = ?');
    params.push(clientId);
  }
  if (q.from) {
    where.push('a.start_at >= ?');
    params.push(q.from);
  }
  if (q.to) {
    where.push('a.start_at < ?');
    params.push(q.to);
  }
  if (q.status) {
    where.push('a.status = ?');
    params.push(q.status);
  }
  if (q.q) {
    where.push('(c.name LIKE ? OR c.email LIKE ? OR sv.name LIKE ?)');
    params.push(`%${q.q}%`, `%${q.q}%`, `%${q.q}%`);
  }

  const rows = db
    .prepare(`${APPOINTMENT_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY a.start_at LIMIT 1000`)
    .all(...params);
  res.json(rows);
});

function findConflict(p: { start: string; end: string; clientId: number; staffId: number | null; excludeId?: number }) {
  return db
    .prepare(
      `SELECT id FROM appointments
       WHERE status = 'scheduled' AND id != @excludeId
         AND start_at < @end AND end_at > @start
         AND (client_id = @clientId OR (@staffId IS NOT NULL AND staff_id = @staffId))
       LIMIT 1`,
    )
    .get({ ...p, excludeId: p.excludeId ?? 0 }) as { id: number } | undefined;
}

function loadService(id: number) {
  const s = db.prepare('SELECT id, duration_min, is_active FROM services WHERE id = ?').get(id) as
    | { id: number; duration_min: number; is_active: number }
    | undefined;
  if (!s) throw new HttpError(400, 'Unknown service');
  return s;
}

function assertProvider(staffId: number | null | undefined) {
  if (staffId == null) return;
  const ok = db.prepare(`SELECT 1 FROM users WHERE id = ? AND role IN ('staff','admin') AND is_active = 1`).get(staffId);
  if (!ok) throw new HttpError(400, 'Unknown provider');
}

const endOf = (startIso: string, minutes: number) => new Date(new Date(startIso).getTime() + minutes * 60_000).toISOString();

appointmentsRouter.post('/', (req, res) => {
  const b = z
    .object({
      clientId: z.number().int().optional(),
      staffId: z.number().int().nullable().optional(),
      serviceId: z.number().int(),
      startAt: isoDate,
      notes: z.string().max(1000).optional(),
    })
    .parse(req.body);

  const staff = isStaff(req);
  const clientId = staff ? b.clientId : req.user!.id;
  if (!clientId) throw new HttpError(400, 'clientId is required');
  const client = db.prepare(`SELECT id FROM users WHERE id = ? AND role = 'client' AND is_active = 1`).get(clientId);
  if (!client) throw new HttpError(400, 'Unknown or inactive client');

  const service = loadService(b.serviceId);
  if (!service.is_active && !staff) throw new HttpError(400, 'This service is not currently offered');
  assertProvider(b.staffId);
  if (!staff && b.startAt <= new Date().toISOString()) throw new HttpError(400, 'Please choose a time in the future');

  const end = endOf(b.startAt, service.duration_min);
  const staffId = b.staffId ?? null;
  if (findConflict({ start: b.startAt, end, clientId, staffId })) {
    throw new HttpError(409, 'That time overlaps another appointment for this client or provider');
  }

  const info = db
    .prepare(
      `INSERT INTO appointments (client_id, staff_id, service_id, start_at, end_at, notes) VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(clientId, staffId, service.id, b.startAt, end, b.notes || null);
  const id = Number(info.lastInsertRowid);
  audit(req, 'book_appointment', 'appointment', id, { clientId, startAt: b.startAt });
  res.status(201).json(db.prepare(`${APPOINTMENT_SELECT} WHERE a.id = ?`).get(id));
});

appointmentsRouter.patch('/:id', (req, res) => {
  const id = parseId(req.params.id);
  const appt = db.prepare('SELECT * FROM appointments WHERE id = ?').get(id) as AppointmentRow | undefined;
  if (!appt) throw new HttpError(404, 'Appointment not found');

  const b = z
    .object({
      status: statusSchema.optional(),
      startAt: isoDate.optional(),
      staffId: z.number().int().nullable().optional(),
      serviceId: z.number().int().optional(),
      notes: z.string().max(1000).nullable().optional(),
    })
    .parse(req.body);

  if (!isStaff(req)) {
    // Clients may only cancel their own upcoming appointments.
    const onlyCancel = b.status === 'cancelled' && Object.keys(b).length === 1;
    if (appt.client_id !== req.user!.id) throw new HttpError(404, 'Appointment not found');
    if (!onlyCancel) throw new HttpError(403, 'Please contact us to change an appointment');
    if (appt.status !== 'scheduled' || appt.start_at <= new Date().toISOString()) {
      throw new HttpError(400, 'Only upcoming appointments can be cancelled');
    }
  }

  const serviceId = b.serviceId ?? appt.service_id;
  const startAt = b.startAt ?? appt.start_at;
  const staffId = b.staffId !== undefined ? b.staffId : appt.staff_id;
  const status = b.status ?? appt.status;
  const endAt = b.startAt || b.serviceId ? endOf(startAt, loadService(serviceId).duration_min) : appt.end_at;
  if (b.staffId !== undefined) assertProvider(b.staffId);

  if (status === 'scheduled' && (b.startAt || b.serviceId || b.staffId !== undefined || b.status === 'scheduled')) {
    if (findConflict({ start: startAt, end: endAt, clientId: appt.client_id, staffId, excludeId: id })) {
      throw new HttpError(409, 'That time overlaps another appointment for this client or provider');
    }
  }

  db.prepare(
    `UPDATE appointments SET status = ?, start_at = ?, end_at = ?, staff_id = ?, service_id = ?, notes = ? WHERE id = ?`,
  ).run(status, startAt, endAt, staffId, serviceId, b.notes !== undefined ? b.notes || null : appt.notes, id);

  const action = b.status && b.status !== appt.status ? `appointment_${b.status}` : b.startAt ? 'reschedule_appointment' : 'update_appointment';
  audit(req, action, 'appointment', id, { from: appt.status !== status ? appt.status : undefined, startAt: b.startAt });
  res.json(db.prepare(`${APPOINTMENT_SELECT} WHERE a.id = ?`).get(id));
});
