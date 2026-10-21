import { Hono } from 'hono';
import { z } from 'zod';
import { all, one } from '../db.js';
import type { AppEnv } from '../lib/auth.js';
import { APPOINTMENT_SELECT } from './appointments.js';
import { DOCUMENT_SELECT } from './documents.js';
import { STAGES } from './projects.js';
import { PAYMENT_SELECT } from './payments.js';

export const dashboardRouter = new Hono<AppEnv>();

const DAY = 86_400_000;

/**
 * The client sends the bounds of "today" in its own timezone so the schedule
 * matches what staff see on the wall clock.
 */
dashboardRouter.get('/summary', async (c) => {
  const q = z
    .object({ dayStart: z.string().datetime({ offset: true }), dayEnd: z.string().datetime({ offset: true }) })
    .parse(c.req.query());
  const dayStart = new Date(q.dayStart).toISOString();
  const dayEnd = new Date(q.dayEnd).toISOString();
  const now = new Date();
  const nowIso = now.toISOString();
  const in7d = new Date(now.getTime() + 7 * DAY).toISOString();
  const ago30d = new Date(now.getTime() - 30 * DAY).toISOString();
  const ago14d = new Date(now.getTime() - 13 * DAY);
  ago14d.setUTCHours(0, 0, 0, 0);

  const biz = c.get('biz');
  const [stats, revenueRows, today, recentPayments, unpaid, stages, toReview] = await Promise.all([
    one<Record<string, number>>(
      `SELECT
         (SELECT COUNT(*) FROM appointments WHERE biz = ?1 AND start_at >= ?2 AND start_at < ?3 AND status != 'cancelled') AS todayCount,
         (SELECT COUNT(*) FROM appointments WHERE biz = ?1 AND status = 'scheduled' AND start_at >= ?4 AND start_at < ?5) AS upcoming7d,
         (SELECT COALESCE(SUM(amount_cents), 0) FROM payments WHERE biz = ?1 AND status = 'paid' AND paid_at >= ?6) AS revenue30dCents,
         (SELECT COALESCE(SUM(amount_cents), 0) FROM payments WHERE biz = ?1 AND status = 'pending') AS pendingCents,
         (SELECT COUNT(*) FROM users WHERE role = 'client' AND is_active = 1) AS activeClients,
         (SELECT COUNT(*) FROM users WHERE role = 'client' AND created_at >= ?6) AS newClients30d,
         (SELECT COUNT(*) FROM users WHERE locked_until > ?4) AS lockedAccounts,
         (SELECT COUNT(*) FROM appointments WHERE biz = ?1 AND status IN ('cancelled','no_show') AND start_at >= ?6 AND start_at < ?4) AS cancelled30d,
         (SELECT COUNT(*) FROM appointments WHERE biz = ?1 AND start_at >= ?6 AND start_at < ?4) AS total30d,
         (SELECT COUNT(*) FROM projects WHERE biz = ?1 AND stage != 'done') AS openProjects,
         (SELECT COUNT(*) FROM documents WHERE biz = ?1 AND status = 'received') AS documentsToReview,
         (SELECT COUNT(*) FROM documents WHERE biz = ?1 AND status = 'requested') AS documentsRequested,
         (SELECT COUNT(*) FROM messages WHERE biz = ?1 AND read_at IS NULL AND sender_id = client_id) AS unreadMessages`,
      biz, dayStart, dayEnd, nowIso, in7d, ago30d,
    ),
    all<{ day: string; cents: number }>(
      `SELECT substr(paid_at, 1, 10) AS day, SUM(amount_cents) AS cents
       FROM payments WHERE biz = ? AND status = 'paid' AND paid_at >= ? GROUP BY day`,
      biz,
      ago14d.toISOString(),
    ),
    all(`${APPOINTMENT_SELECT} WHERE a.biz = ? AND a.start_at >= ? AND a.start_at < ? ORDER BY a.start_at`, biz, dayStart, dayEnd),
    all(`${PAYMENT_SELECT} WHERE p.biz = ? ORDER BY p.paid_at DESC LIMIT 6`, biz),
    all(
      `SELECT * FROM (${APPOINTMENT_SELECT} WHERE a.biz = ? AND a.status = 'completed') WHERE paidCents < priceCents
       ORDER BY startAt DESC LIMIT 6`,
      biz,
    ),
    all<{ stage: string; count: number }>(`SELECT stage, COUNT(*) AS count FROM projects WHERE biz = ? GROUP BY stage`, biz),
    all(`${DOCUMENT_SELECT} WHERE d.biz = ? AND d.status = 'received' ORDER BY d.uploaded_at DESC LIMIT 6`, biz),
  ]);

  const byDay = new Map(revenueRows.map((r) => [r.day, r.cents]));
  const revenueByDay = Array.from({ length: 14 }, (_, i) => {
    const day = new Date(ago14d.getTime() + i * DAY).toISOString().slice(0, 10);
    return { day, cents: byDay.get(day) ?? 0 };
  });

  const byStage = new Map(stages.map((r) => [r.stage, r.count]));
  const projectStages = STAGES.map((stage) => ({ stage, count: byStage.get(stage) ?? 0 }));

  return c.json({ stats, revenueByDay, today, recentPayments, unpaid, projectStages, toReview });
});
