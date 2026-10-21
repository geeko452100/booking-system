import { Hono } from 'hono';
import { z } from 'zod';
import { all, one, run } from '../db.js';
import { audit } from '../lib/audit.js';
import { isStaff, requireRole, type AppEnv } from '../lib/auth.js';
import { HttpError, parseId } from '../lib/http.js';

/**
 * Tracked pieces of work for a client, such as a repair job or a training program, and where each
 * one stands. Clients see their own; staff see and update all. Stage names come from the business type.
 */
export const projectsRouter = new Hono<AppEnv>();

export const STAGES = ['new', 'planning', 'active', 'review', 'done'] as const;
const stageSchema = z.enum(STAGES);
const isoDate = z.string().datetime({ offset: true }).transform((s) => new Date(s).toISOString());

export const PROJECT_SELECT = `
  SELECT m.id, m.client_id AS clientId, c.name AS clientName, m.staff_id AS staffId,
         st.name AS staffName, sp.title AS staffTitle, sp.photo AS staffPhoto,
         m.title, m.kind, m.stage, m.next_step AS nextStep, m.next_date AS nextDate,
         m.updated_at AS updatedAt, m.created_at AS createdAt,
         (SELECT COUNT(*) FROM documents d WHERE d.project_id = m.id AND d.status = 'requested') AS openRequests
  FROM projects m
  JOIN users c ON c.id = m.client_id
  LEFT JOIN users st ON st.id = m.staff_id
  LEFT JOIN staff_profiles sp ON sp.user_id = m.staff_id AND sp.biz = m.biz`;

const getProject = (id: number) => one(`${PROJECT_SELECT} WHERE m.id = ?`, id);

projectsRouter.get('/', async (c) => {
  const q = z
    .object({ clientId: z.coerce.number().int().optional(), stage: stageSchema.optional(), q: z.string().trim().optional() })
    .parse(c.req.query());
  const where = ['m.biz = ?'];
  const params: (string | number)[] = [c.get('biz')];
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
    where.push('(c.name LIKE ? OR m.title LIKE ? OR m.kind LIKE ?)');
    params.push(`%${q.q}%`, `%${q.q}%`, `%${q.q}%`);
  }
  return c.json(
    await all(`${PROJECT_SELECT} WHERE ${where.join(' AND ')} ORDER BY m.stage = 'done', m.updated_at DESC LIMIT 500`, ...params),
  );
});

async function assertStaffMember(staffId: number | null | undefined) {
  if (staffId == null) return;
  const ok = await one(`SELECT 1 FROM users WHERE id = ? AND role IN ('staff','admin') AND is_active = 1`, staffId);
  if (!ok) throw new HttpError(400, 'Unknown team member');
}

projectsRouter.post('/', requireRole('admin', 'staff'), async (c) => {
  const b = z
    .object({
      clientId: z.number().int(),
      staffId: z.number().int().nullable().optional(),
      title: z.string().trim().min(1).max(150),
      kind: z.string().trim().min(1).max(60),
      nextStep: z.string().trim().max(200).optional(),
      nextDate: isoDate.optional(),
    })
    .parse(await c.req.json());
  if (!(await one(`SELECT 1 FROM users WHERE id = ? AND role = 'client'`, b.clientId))) throw new HttpError(400, 'Unknown client');
  await assertStaffMember(b.staffId);

  const { id } = await run(
    `INSERT INTO projects (biz, client_id, staff_id, title, kind, next_step, next_date) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    c.get('biz'), b.clientId, b.staffId ?? c.get('user').id, b.title, b.kind, b.nextStep || null, b.nextDate ?? null,
  );
  await audit(c, 'open_project', 'project', id, { clientId: b.clientId, title: b.title });
  return c.json(await getProject(id), 201);
});

projectsRouter.patch('/:id', requireRole('admin', 'staff'), async (c) => {
  const id = parseId(c.req.param('id'));
  const current = await one<{ stage: string }>('SELECT stage FROM projects WHERE id = ? AND biz = ?', id, c.get('biz'));
  if (!current) throw new HttpError(404, 'Not found');
  const b = z
    .object({
      stage: stageSchema.optional(),
      staffId: z.number().int().nullable().optional(),
      title: z.string().trim().min(1).max(150).optional(),
      nextStep: z.string().trim().max(200).nullable().optional(),
      nextDate: isoDate.nullable().optional(),
    })
    .parse(await c.req.json());
  if (b.staffId !== undefined) await assertStaffMember(b.staffId);

  await run(
    `UPDATE projects SET
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
  await audit(c, stageChanged ? 'project_stage_changed' : 'update_project', 'project', id,
    stageChanged ? { from: current.stage, to: b.stage } : { fields: Object.keys(b) });
  return c.json(await getProject(id));
});
