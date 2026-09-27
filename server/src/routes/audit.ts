import { Hono } from 'hono';
import { z } from 'zod';
import { all } from '../db.js';
import type { AppEnv } from '../lib/auth.js';

export const auditRouter = new Hono<AppEnv>();

auditRouter.get('/', async (c) => {
  const q = z
    .object({ q: z.string().trim().optional(), limit: z.coerce.number().int().min(1).max(1000).default(200) })
    .parse(c.req.query());
  const like = q.q ? `%${q.q}%` : null;
  return c.json(
    await all(
      `SELECT l.id, l.action, l.entity, l.entity_id AS entityId, l.details, l.ip, l.created_at AS createdAt,
              a.name AS actorName, a.role AS actorRole,
              CASE WHEN l.entity = 'user' THEN (SELECT name FROM users WHERE id = l.entity_id) END AS subjectName
       FROM audit_log l LEFT JOIN users a ON a.id = l.actor_id
       WHERE ?1 IS NULL OR l.action LIKE ?1 OR a.name LIKE ?1 OR l.entity LIKE ?1
       ORDER BY l.id DESC LIMIT ?2`,
      like,
      q.limit,
    ),
  );
});
