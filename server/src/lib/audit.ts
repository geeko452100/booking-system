import type { Request } from 'express';
import { db } from '../db.js';

const insert = db.prepare(
  `INSERT INTO audit_log (actor_id, action, entity, entity_id, details, ip)
   VALUES (?, ?, ?, ?, ?, ?)`,
);

export function audit(
  req: Request,
  action: string,
  entity: string,
  entityId: number | null,
  details?: Record<string, unknown>,
  actorId: number | null = req.user?.id ?? null,
) {
  insert.run(actorId, action, entity, entityId, details ? JSON.stringify(details) : null, req.ip ?? null);
}
