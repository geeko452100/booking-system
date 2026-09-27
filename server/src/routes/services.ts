import { Hono } from 'hono';
import { z } from 'zod';
import { all, one, run } from '../db.js';
import { audit } from '../lib/audit.js';
import { isStaff, requireRole, type AppEnv } from '../lib/auth.js';
import { HttpError, parseId } from '../lib/http.js';

export const servicesRouter = new Hono<AppEnv>();

const SELECT = `SELECT id, name, description, duration_min AS durationMin, price_cents AS priceCents,
  is_active AS isActive FROM services`;

type ServiceRow = Record<string, unknown> & { isActive: number };
const toService = (r: ServiceRow | null) => r && { ...r, isActive: !!r.isActive };

servicesRouter.get('/', async (c) => {
  const rows = await all<ServiceRow>(`${SELECT} ${isStaff(c) ? '' : 'WHERE is_active = 1'} ORDER BY name`);
  return c.json(rows.map(toService));
});

const serviceSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).nullable().optional(),
  durationMin: z.number().int().min(5).max(24 * 60),
  priceCents: z.number().int().min(0),
  isActive: z.boolean().default(true),
});

servicesRouter.post('/', requireRole('admin'), async (c) => {
  const b = serviceSchema.parse(await c.req.json());
  const { id } = await run(
    'INSERT INTO services (name, description, duration_min, price_cents, is_active) VALUES (?, ?, ?, ?, ?)',
    b.name, b.description || null, b.durationMin, b.priceCents, b.isActive,
  );
  await audit(c, 'create_service', 'service', id, { name: b.name });
  return c.json(toService(await one<ServiceRow>(`${SELECT} WHERE id = ?`, id)), 201);
});

servicesRouter.put('/:id', requireRole('admin'), async (c) => {
  const id = parseId(c.req.param('id'));
  const b = serviceSchema.parse(await c.req.json());
  const { changes } = await run(
    'UPDATE services SET name = ?, description = ?, duration_min = ?, price_cents = ?, is_active = ? WHERE id = ?',
    b.name, b.description || null, b.durationMin, b.priceCents, b.isActive, id,
  );
  if (!changes) throw new HttpError(404, 'Service not found');
  await audit(c, 'update_service', 'service', id, { name: b.name });
  return c.json(toService(await one<ServiceRow>(`${SELECT} WHERE id = ?`, id)));
});
