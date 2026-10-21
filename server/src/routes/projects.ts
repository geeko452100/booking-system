import { Hono } from 'hono';
import { z } from 'zod';
import { all, one, run } from '../db.js';
import { audit } from '../lib/audit.js';
import { isStaff, requireRole, type AppEnv } from '../lib/auth.js';
import { HttpError, parseId } from '../lib/http.js';

/** Legal matters (cases) and where each one stands. Clients see their own; staff see and update all. */
export const mattersRouter = new Hono<AppEnv>();

export const STAGES = ['intake', 'investigation', 'negotiation', 'resolution', 'closed'] as const;
const stageSchema = z.enum(STAGES);
const isoDate = z.string().datetime({ offset: true }).transform((s) => new Date(s).toISOString());

export const MATTER_SELECT = `
  SELECT m.id, m.client_id AS clientId, c.name AS clientName, m.staff_id AS staffId,
         st.name AS staffName, st.title AS staffTitle, st.photo AS staffPhoto,
         m.title, m.practice, m.stage, m.next_step AS nextStep, m.next_date AS nextDate,
         m.updated_at AS updatedAt, m.created_at AS createdAt,
         (SELECT COUNT(*) FROM documents d WHERE d.matter_id = m.id AND d.status = 'requested') AS openRequests
  FROM matters m
  JOIN users c ON c.id = m.client_id
  LEFT JOIN users st ON st.id = m.staff_id`;

const getMatter = (id: number) => one(`${MATTER_SELECT} WHERE m.id = ?`, id);

mattersRouter.get('/', async (c) => {
  const q = z
    .object({ clientId: z.coerce.number().int().optional(), stage: stageSchema.optional(), q: z.string().trim().optional() })
    .parse(c.req.query());
  const where: string[] = [];
  const params: (string | number)[] = [];
  const clientId = isStaff(c) ? q.clientId : c.get('user').id;
  if (clientId) {
    where.push('m.client_id = ?');
    params.push(clientId);
  }
  if (q.stage) {
    where.push('m.stage = ?');
    params.push(q.stage);
  }
  if (q.q) {
    where.push('(c.name LIKE ? OR m.title LIKE ? OR m.practice LIKE ?)');
    params.push(`%${q.q}%`, `%${q.q}%`, `%${q.q}%`);
  }
  return c.json(
    await all(
      `${MATTER_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY m.stage = 'closed', m.updated_at DESC LIMIT 500`,
      ...params,
    ),
  );
});

async function assertAttorney(staffId: number | null | undefined) {
  if (staffId == null) return;
  const ok = await one(`SELECT 1 FROM users WHERE id = ? AND role IN ('staff','admin') AND is_active = 1`, staffId);
  if (!ok) throw new HttpError(400, 'Unknown attorney');
}

mattersRouter.post('/', requireRole('admin', 'staff'), async (c) => {
  const b = z
    .object({
      clientId: z.number().int(),
      staffId: z.number().int().nullable().optional(),
      title: z.string().trim().min(1).max(150),
      practice: z.string().trim().min(1).max(60),
      nextStep: z.string().trim().max(200).optional(),
      nextDate: isoDate.optional(),
    })
    .parse(await c.req.json());
  if (!(await one(`SELECT 1 FROM users WHERE id = ? AND role = 'client'`, b.clientId))) throw new HttpError(400, 'Unknown client');
  await assertAttorney(b.staffId);

  const { id } = await run(
    `INSERT INTO matters (client_id, staff_id, title, practice, next_step, next_date) VALUES (?, ?, ?, ?, ?, ?)`,
    b.clientId, b.staffId ?? c.get('user').id, b.title, b.practice, b.nextStep || null, b.nextDate ?? null,
  );
  await audit(c, 'open_matter', 'matter', id, { clientId: b.clientId, title: b.title });
  return c.json(await getMatter(id), 201);
});

mattersRouter.patch('/:id', requireRole('admin', 'staff'), async (c) => {
  const id = parseId(c.req.param('id'));
  const current = await one<{ stage: string }>('SELECT stage FROM matters WHERE id = ?', id);
  if (!current) throw new HttpError(404, 'Matter not found');
  const b = z
    .object({
      stage: stageSchema.optional(),
      staffId: z.number().int().nullable().optional(),
      title: z.string().trim().min(1).max(150).optional(),
      nextStep: z.string().trim().max(200).nullable().optional(),
      nextDate: isoDate.nullable().optional(),
    })
    .parse(await c.req.json());
  if (b.staffId !== undefined) await assertAttorney(b.staffId);

  await run(
    `UPDATE matters SET
       stage = COALESCE(?, stage), title = COALESCE(?, title),
       staff_id = CASE WHEN ? THEN ? ELSE staff_id END,
       next_step = CASE WHEN ? THEN ? ELSE next_step END,
       next_date = CASE WHEN ? THEN ? ELSE next_date END,
       updated_at = ?
     WHERE id = ?`,
    b.stage, b.title,
    b.staffId !== undefined, b.staffId ?? null,
    b.nextStep !== undefined, b.nextStep || null,
    b.nextDate !== undefined, b.nextDate ?? null,
    new Date().toISOString(), id,
  );
  const stageChanged = b.stage && b.stage !== current.stage;
  await audit(c, stageChanged ? 'matter_stage_changed' : 'update_matter', 'matter', id,
    stageChanged ? { from: current.stage, to: b.stage } : { fields: Object.keys(b) });
  return c.json(await getMatter(id));
});
