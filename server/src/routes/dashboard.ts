import { Hono } from 'hono';
import { z } from 'zod';
import { all, one } from '../db.js';
import type { AppEnv } from '../lib/auth.js';
import { APPOINTMENT_SELECT } from './appointments.js';
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

  const [stats, revenueRows, today, recentPayments, unpaid] = await Promise.all([
    one<Record<string, number>>(
      `SELECT
         (SELECT COUNT(*) FROM appointments WHERE start_at >= ? AND start_at < ? AND status != 'cancelled') AS todayCount,
         (SELECT COUNT(*) FROM appointments WHERE status = 'scheduled' AND start_at >= ? AND start_at < ?) AS upcoming7d,
         (SELECT COALESCE(SUM(amount_cents), 0) FROM payments WHERE status = 'paid' AND paid_at >= ?) AS revenue30dCents,
         (SELECT COALESCE(SUM(amount_cents), 0) FROM payments WHERE status = 'pending') AS pendingCents,
         (SELECT COUNT(*) FROM users WHERE role = 'client' AND is_active = 1) AS activeClients,
         (SELECT COUNT(*) FROM users WHERE role = 'client' AND created_at >= ?) AS newClients30d,
         (SELECT COUNT(*) FROM users WHERE locked_until > ?) AS lockedAccounts,
         (SELECT COUNT(*) FROM appointments WHERE status IN ('cancelled','no_show') AND start_at >= ? AND start_at < ?) AS cancelled30d,
         (SELECT COUNT(*) FROM appointments WHERE start_at >= ? AND start_at < ?) AS total30d`,
      dayStart, dayEnd, nowIso, in7d, ago30d, ago30d, nowIso, ago30d, nowIso, ago30d, nowIso,
    ),
    all<{ day: string; cents: number }>(
      `SELECT substr(paid_at, 1, 10) AS day, SUM(amount_cents) AS cents
       FROM payments WHERE status = 'paid' AND paid_at >= ? GROUP BY day`,
      ago14d.toISOString(),
    ),
    all(`${APPOINTMENT_SELECT} WHERE a.start_at >= ? AND a.start_at < ? ORDER BY a.start_at`, dayStart, dayEnd),
    all(`${PAYMENT_SELECT} ORDER BY p.paid_at DESC LIMIT 6`),
    all(
      `SELECT * FROM (${APPOINTMENT_SELECT} WHERE a.status = 'completed') WHERE paidCents < priceCents
       ORDER BY startAt DESC LIMIT 6`,
    ),
  ]);

  const byDay = new Map(revenueRows.map((r) => [r.day, r.cents]));
  const revenueByDay = Array.from({ length: 14 }, (_, i) => {
    const day = new Date(ago14d.getTime() + i * DAY).toISOString().slice(0, 10);
    return { day, cents: byDay.get(day) ?? 0 };
  });

  return c.json({ stats, revenueByDay, today, recentPayments, unpaid });
});
