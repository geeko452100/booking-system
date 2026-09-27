import type { Context } from 'hono';
import { run } from '../db.js';
import type { AppEnv } from './auth.js';

export async function audit(
  c: Context<AppEnv>,
  action: string,
  entity: string,
  entityId: number | null,
  details?: Record<string, unknown>,
  actorId: number | null = c.get('user')?.id ?? null,
) {
  await run(
    `INSERT INTO audit_log (actor_id, action, entity, entity_id, details, ip) VALUES (?, ?, ?, ?, ?, ?)`,
    actorId,
    action,
    entity,
    entityId,
    details ? JSON.stringify(details) : null,
    c.req.header('cf-connecting-ip') ?? null,
  );
}
