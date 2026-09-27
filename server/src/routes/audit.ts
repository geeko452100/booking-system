import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db.js';

export const auditRouter = Router();

auditRouter.get('/', (req, res) => {
  const q = z
    .object({ q: z.string().trim().optional(), limit: z.coerce.number().int().min(1).max(1000).default(200) })
    .parse(req.query);
  const like = q.q ? `%${q.q}%` : null;
  const rows = db
    .prepare(
      `SELECT l.id, l.action, l.entity, l.entity_id AS entityId, l.details, l.ip, l.created_at AS createdAt,
              a.name AS actorName, a.role AS actorRole,
              CASE WHEN l.entity = 'user' THEN (SELECT name FROM users WHERE id = l.entity_id) END AS subjectName
       FROM audit_log l LEFT JOIN users a ON a.id = l.actor_id
       WHERE @like IS NULL OR l.action LIKE @like OR a.name LIKE @like OR l.entity LIKE @like
       ORDER BY l.id DESC LIMIT @limit`,
    )
    .all({ like, limit: q.limit });
  res.json(rows);
});
