import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db.js';
import { APPOINTMENT_SELECT } from './appointments.js';
import { PAYMENT_SELECT } from './payments.js';

export const dashboardRouter = Router();

const DAY = 86_400_000;

/**
 * The client sends the bounds of "today" in its own timezone so the schedule
 * matches what staff see on the wall clock.
 */
dashboardRouter.get('/summary', (req, res) => {
  const q = z
    .object({ dayStart: z.string().datetime({ offset: true }), dayEnd: z.string().datetime({ offset: true }) })
    .parse(req.query);
  const dayStart = new Date(q.dayStart).toISOString();
  const dayEnd = new Date(q.dayEnd).toISOString();
  const now = new Date();
  const nowIso = now.toISOString();
  const in7d = new Date(now.getTime() + 7 * DAY).toISOString();
  const ago30d = new Date(now.getTime() - 30 * DAY).toISOString();
  const ago14d = new Date(now.getTime() - 13 * DAY);
  ago14d.setUTCHours(0, 0, 0, 0);

  const scalar = (sql: string, ...params: unknown[]) =>
    (db.prepare(sql).pluck().get(...params) as number | null) ?? 0;

  const stats = {
    todayCount: scalar(`SELECT COUNT(*) FROM appointments WHERE start_at >= ? AND start_at < ? AND status != 'cancelled'`, dayStart, dayEnd),
    upcoming7d: scalar(`SELECT COUNT(*) FROM appointments WHERE status = 'scheduled' AND start_at >= ? AND start_at < ?`, nowIso, in7d),
    revenue30dCents: scalar(`SELECT SUM(amount_cents) FROM payments WHERE status = 'paid' AND paid_at >= ?`, ago30d),
    pendingCents: scalar(`SELECT SUM(amount_cents) FROM payments WHERE status = 'pending'`),
    activeClients: scalar(`SELECT COUNT(*) FROM users WHERE role = 'client' AND is_active = 1`),
    newClients30d: scalar(`SELECT COUNT(*) FROM users WHERE role = 'client' AND created_at >= ?`, ago30d),
    lockedAccounts: scalar(`SELECT COUNT(*) FROM users WHERE locked_until > ?`, nowIso),
    cancelled30d: scalar(`SELECT COUNT(*) FROM appointments WHERE status IN ('cancelled','no_show') AND start_at >= ? AND start_at < ?`, ago30d, nowIso),
    total30d: scalar(`SELECT COUNT(*) FROM appointments WHERE start_at >= ? AND start_at < ?`, ago30d, nowIso),
  };

  const revenueRows = db
    .prepare(
      `SELECT substr(paid_at, 1, 10) AS day, SUM(amount_cents) AS cents
       FROM payments WHERE status = 'paid' AND paid_at >= ? GROUP BY day`,
    )
    .all(ago14d.toISOString()) as { day: string; cents: number }[];
  const byDay = new Map(revenueRows.map((r) => [r.day, r.cents]));
  const revenueByDay = Array.from({ length: 14 }, (_, i) => {
    const day = new Date(ago14d.getTime() + i * DAY).toISOString().slice(0, 10);
    return { day, cents: byDay.get(day) ?? 0 };
  });

  const today = db
    .prepare(`${APPOINTMENT_SELECT} WHERE a.start_at >= ? AND a.start_at < ? ORDER BY a.start_at`)
    .all(dayStart, dayEnd);
  const recentPayments = db.prepare(`${PAYMENT_SELECT} ORDER BY p.paid_at DESC LIMIT 6`).all();
  const unpaid = db
    .prepare(
      `SELECT * FROM (${APPOINTMENT_SELECT} WHERE a.status = 'completed') WHERE paidCents < priceCents
       ORDER BY startAt DESC LIMIT 6`,
    )
    .all();

  res.json({ stats, revenueByDay, today, recentPayments, unpaid });
});
