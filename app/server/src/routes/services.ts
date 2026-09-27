import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db.js';
import { audit } from '../lib/audit.js';
import { isStaff, requireRole } from '../lib/auth.js';
import { HttpError, parseId } from '../lib/http.js';

export const servicesRouter = Router();

const SELECT = `SELECT id, name, description, duration_min AS durationMin, price_cents AS priceCents,
  is_active AS isActive FROM services`;

const toService = (r: Record<string, unknown>) => ({ ...r, isActive: !!r.isActive });

servicesRouter.get('/', (req, res) => {
  const rows = db
    .prepare(`${SELECT} ${isStaff(req) ? '' : 'WHERE is_active = 1'} ORDER BY name`)
    .all() as Record<string, unknown>[];
  res.json(rows.map(toService));
});

const serviceSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).nullable().optional(),
  durationMin: z.number().int().min(5).max(24 * 60),
  priceCents: z.number().int().min(0),
  isActive: z.boolean().default(true),
});

servicesRouter.post('/', requireRole('admin'), (req, res) => {
  const b = serviceSchema.parse(req.body);
  const info = db
    .prepare('INSERT INTO services (name, description, duration_min, price_cents, is_active) VALUES (?, ?, ?, ?, ?)')
    .run(b.name, b.description || null, b.durationMin, b.priceCents, Number(b.isActive));
  const id = Number(info.lastInsertRowid);
  audit(req, 'create_service', 'service', id, { name: b.name });
  res.status(201).json(toService(db.prepare(`${SELECT} WHERE id = ?`).get(id) as Record<string, unknown>));
});

servicesRouter.put('/:id', requireRole('admin'), (req, res) => {
  const id = parseId(req.params.id);
  const b = serviceSchema.parse(req.body);
  const info = db
    .prepare('UPDATE services SET name = ?, description = ?, duration_min = ?, price_cents = ?, is_active = ? WHERE id = ?')
    .run(b.name, b.description || null, b.durationMin, b.priceCents, Number(b.isActive), id);
  if (!info.changes) throw new HttpError(404, 'Service not found');
  audit(req, 'update_service', 'service', id, { name: b.name });
  res.json(toService(db.prepare(`${SELECT} WHERE id = ?`).get(id) as Record<string, unknown>));
});
