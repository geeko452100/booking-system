import { Hono } from 'hono';
import { z } from 'zod';
import { all, one, run } from '../db.js';
import { audit } from '../lib/audit.js';
import { isStaff, type AppEnv } from '../lib/auth.js';
import { HttpError, parseId } from '../lib/http.js';

export const appointmentsRouter = new Hono<AppEnv>();

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
const OVERLAP = 'That time overlaps another appointment for this client or provider';

/**
 * SQL condition that is true when another scheduled appointment overlaps the slot for the same
 * client or provider. Used inside the INSERT/UPDATE so the check and the write are one atomic step.
 */
const CONFLICT = `EXISTS (
  SELECT 1 FROM appointments
  WHERE status = 'scheduled' AND id != ? AND start_at < ? AND end_at > ?
    AND (client_id = ? OR (? IS NOT NULL AND staff_id = ?)))`;
const conflictParams = (p: { excludeId: number; start: string; end: string; clientId: number; staffId: number | null }) =>
  [p.excludeId, p.end, p.start, p.clientId, p.staffId, p.staffId] as const;

const getAppointment = (id: number) => one(`${APPOINTMENT_SELECT} WHERE a.id = ?`, id);

/** Providers a client can pick when booking. */
appointmentsRouter.get('/providers', async (c) =>
  c.json(await all(`SELECT id, name FROM users WHERE role IN ('staff','admin') AND is_active = 1 ORDER BY name`)),
);

appointmentsRouter.get('/', async (c) => {
  const q = z
    .object({
      from: isoDate.optional(),
      to: isoDate.optional(),
      status: statusSchema.optional(),
      clientId: z.coerce.number().int().optional(),
      q: z.string().trim().optional(),
    })
    .parse(c.req.query());

  const where: string[] = [];
  const params: (string | number)[] = [];
  const clientId = isStaff(c) ? q.clientId : c.get('user').id;
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

  return c.json(
    await all(`${APPOINTMENT_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY a.start_at LIMIT 1000`, ...params),
  );
});

async function loadService(id: number) {
  const s = await one<{ id: number; duration_min: number; is_active: number }>(
    'SELECT id, duration_min, is_active FROM services WHERE id = ?',
    id,
  );
  if (!s) throw new HttpError(400, 'Unknown service');
  return s;
}

async function assertProvider(staffId: number | null | undefined) {
  if (staffId == null) return;
  const ok = await one(`SELECT 1 FROM users WHERE id = ? AND role IN ('staff','admin') AND is_active = 1`, staffId);
  if (!ok) throw new HttpError(400, 'Unknown provider');
}

const endOf = (startIso: string, minutes: number) => new Date(new Date(startIso).getTime() + minutes * 60_000).toISOString();

appointmentsRouter.post('/', async (c) => {
  const b = z
    .object({
      clientId: z.number().int().optional(),
      staffId: z.number().int().nullable().optional(),
      serviceId: z.number().int(),
      startAt: isoDate,
      notes: z.string().max(1000).optional(),
    })
    .parse(await c.req.json());

  const staff = isStaff(c);
  const clientId = staff ? b.clientId : c.get('user').id;
  if (!clientId) throw new HttpError(400, 'clientId is required');
  if (!(await one(`SELECT 1 FROM users WHERE id = ? AND role = 'client' AND is_active = 1`, clientId))) {
    throw new HttpError(400, 'Unknown or inactive client');
  }

  const service = await loadService(b.serviceId);
  if (!service.is_active && !staff) throw new HttpError(400, 'This service is not currently offered');
  await assertProvider(b.staffId);
  if (!staff && b.startAt <= new Date().toISOString()) throw new HttpError(400, 'Please choose a time in the future');

  const end = endOf(b.startAt, service.duration_min);
  const staffId = b.staffId ?? null;
  const { id, changes } = await run(
    `INSERT INTO appointments (client_id, staff_id, service_id, start_at, end_at, notes)
     SELECT ?, ?, ?, ?, ?, ? WHERE NOT ${CONFLICT}`,
    clientId, staffId, service.id, b.startAt, end, b.notes || null,
    ...conflictParams({ excludeId: 0, start: b.startAt, end, clientId, staffId }),
  );
  if (!changes) throw new HttpError(409, OVERLAP);

  await audit(c, 'book_appointment', 'appointment', id, { clientId, startAt: b.startAt });
  return c.json(await getAppointment(id), 201);
});

appointmentsRouter.patch('/:id', async (c) => {
  const id = parseId(c.req.param('id'));
  const appt = await one<AppointmentRow>('SELECT * FROM appointments WHERE id = ?', id);
  if (!appt) throw new HttpError(404, 'Appointment not found');

  const b = z
    .object({
      status: statusSchema.optional(),
      startAt: isoDate.optional(),
      staffId: z.number().int().nullable().optional(),
      serviceId: z.number().int().optional(),
      notes: z.string().max(1000).nullable().optional(),
    })
    .parse(await c.req.json());

  if (!isStaff(c)) {
    // Clients may only cancel their own upcoming appointments.
    if (appt.client_id !== c.get('user').id) throw new HttpError(404, 'Appointment not found');
    if (!(b.status === 'cancelled' && Object.keys(b).length === 1)) {
      throw new HttpError(403, 'Please contact us to change an appointment');
    }
    if (appt.status !== 'scheduled' || appt.start_at <= new Date().toISOString()) {
      throw new HttpError(400, 'Only upcoming appointments can be cancelled');
    }
  }

  const serviceId = b.serviceId ?? appt.service_id;
  const startAt = b.startAt ?? appt.start_at;
  const staffId = b.staffId !== undefined ? b.staffId : appt.staff_id;
  const status = b.status ?? appt.status;
  const endAt = b.startAt || b.serviceId ? endOf(startAt, (await loadService(serviceId)).duration_min) : appt.end_at;
  if (b.staffId !== undefined) await assertProvider(b.staffId);

  const checkConflict =
    status === 'scheduled' && !!(b.startAt || b.serviceId || b.staffId !== undefined || b.status === 'scheduled');
  const { changes } = await run(
    `UPDATE appointments SET status = ?, start_at = ?, end_at = ?, staff_id = ?, service_id = ?, notes = ?
     WHERE id = ? AND (? = 0 OR NOT ${CONFLICT})`,
    status, startAt, endAt, staffId, serviceId, b.notes !== undefined ? b.notes || null : appt.notes,
    id, Number(checkConflict),
    ...conflictParams({ excludeId: id, start: startAt, end: endAt, clientId: appt.client_id, staffId }),
  );
  if (!changes) throw new HttpError(409, OVERLAP);

  const action =
    b.status && b.status !== appt.status ? `appointment_${b.status}` : b.startAt ? 'reschedule_appointment' : 'update_appointment';
  await audit(c, action, 'appointment', id, { from: appt.status !== status ? appt.status : undefined, startAt: b.startAt });
  return c.json(await getAppointment(id));
});
