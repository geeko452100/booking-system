import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { config } from '../config.js';
import { db } from '../db.js';

/** The shared logins advertised on the sign-in page. In demo mode visitors can't break them. */
export const DEMO_ACCOUNTS = [
  { role: 'Admin', email: 'admin@example.com', password: 'Admin123!' },
  { role: 'Staff', email: 'sam@example.com', password: 'Staff123!' },
  { role: 'Client', email: 'client@example.com', password: 'Client123!' },
];
const protectedEmails = new Set(DEMO_ACCOUNTS.map((a) => a.email));

export const isProtectedDemoAccount = (email: string) => config.demoMode && protectedEmails.has(email.toLowerCase());

let cachedHashes: { admin: string; staff: string; client: string } | null = null;

/**
 * Wipes the database and fills it with demo data dated relative to now.
 * Also rotates the data epoch, which signs everyone out: account ids are reused
 * after a reset, so an old session must never carry over to a different account.
 */
export function seedDemoData() {
  let seed = 42;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  const pick = <T>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
  const hashes = (cachedHashes ??= {
    admin: bcrypt.hashSync('Admin123!', 10),
    staff: bcrypt.hashSync('Staff123!', 10),
    client: bcrypt.hashSync('Client123!', 10),
  });
  const insertUser = db.prepare(
    `INSERT INTO users (email, password_hash, name, phone, role, created_at, last_login_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();

  db.transaction(() => {
    db.exec('DELETE FROM audit_log; DELETE FROM payments; DELETE FROM appointments; DELETE FROM services; DELETE FROM users;');
    db.exec('DELETE FROM sqlite_sequence;');
    insertUser.run('admin@example.com', hashes.admin, 'Alex Morgan', '555-0100', 'admin', daysAgo(200), daysAgo(0));
    const staffIds = [
      insertUser.run('sam@example.com', hashes.staff, 'Sam Rivera', '555-0101', 'staff', daysAgo(180), daysAgo(1)),
      insertUser.run('jordan@example.com', hashes.staff, 'Jordan Lee', '555-0102', 'staff', daysAgo(150), daysAgo(2)),
    ].map((r) => Number(r.lastInsertRowid));

    const clientNames = [
      'Priya Patel', 'Marcus Chen', 'Emily Walsh', 'David Okafor', 'Sofia Rossi', 'Liam Murphy', 'Hannah Kim',
      'Noah Schmidt', 'Olivia Brown', 'Ethan Nguyen', 'Ava Martinez', 'Lucas Dubois', 'Mia Johansson', 'Ben Carter',
    ];
    const clientPw = hashes.client;
    const clientIds = clientNames.map((name, i) => {
      const email = i === 0 ? 'client@example.com' : `${name.toLowerCase().replace(' ', '.')}@example.com`;
      return Number(
        insertUser.run(email, clientPw, name, `555-01${(20 + i).toString()}`, 'client', daysAgo(120 - i * 8), daysAgo(i % 9))
          .lastInsertRowid,
      );
    });
    // A few account states worth seeing on the dashboard.
    db.prepare(`UPDATE users SET locked_until = ?, failed_logins = 0 WHERE id = ?`).run(
      new Date(Date.now() + 10 * 60_000).toISOString(),
      clientIds[5],
    );
    db.prepare(`UPDATE users SET is_active = 0 WHERE id = ?`).run(clientIds[13]);

    const services = [
      ['Initial consultation', 'First visit including assessment', 60, 9000],
      ['Follow-up session', 'Standard follow-up appointment', 30, 5500],
      ['Extended session', 'Longer treatment session', 90, 13000],
      ['Group workshop', 'Small-group session', 120, 4000],
      ['Quick check-in', 'Short review', 15, 2500],
    ] as const;
    const serviceRows = services.map(([name, desc, dur, price]) => ({
      id: Number(
        db
          .prepare('INSERT INTO services (name, description, duration_min, price_cents) VALUES (?, ?, ?, ?)')
          .run(name, desc, dur, price).lastInsertRowid,
      ),
      dur,
      price,
    }));

    const insertAppt = db.prepare(
      `INSERT INTO appointments (client_id, staff_id, service_id, start_at, end_at, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertPayment = db.prepare(
      `INSERT INTO payments (client_id, appointment_id, amount_cents, method, status, reference, recorded_by, paid_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );

    const now = new Date();
    // Each provider has a set of slots per weekday, from 30 days ago to 14 days ahead.
    for (let offset = -30; offset <= 14; offset++) {
      const day = new Date(now);
      day.setDate(day.getDate() + offset);
      if (day.getDay() === 0) continue;
      for (const staffId of staffIds) {
        let hour = 9;
        while (hour < 17) {
          if (rand() < 0.45) {
            hour += 1;
            continue;
          }
          const svc = pick(serviceRows);
          const start = new Date(day);
          start.setHours(hour, rand() < 0.5 ? 0 : 30, 0, 0);
          const end = new Date(start.getTime() + svc.dur * 60_000);
          if (end.getHours() > 17 || (end.getHours() === 17 && end.getMinutes() > 0)) break;
          const clientId = pick(clientIds.slice(0, 13));
          const past = end < now;
          const r = rand();
          const status = past ? (r < 0.82 ? 'completed' : r < 0.92 ? 'cancelled' : 'no_show') : r < 0.93 ? 'scheduled' : 'cancelled';
          const apptId = Number(
            insertAppt.run(clientId, staffId, svc.id, start.toISOString(), end.toISOString(), status,
              new Date(start.getTime() - 7 * 86_400_000).toISOString()).lastInsertRowid,
          );
          if (status === 'completed' && rand() < 0.88) {
            const pr = rand();
            insertPayment.run(
              clientId, apptId, svc.price,
              pick(['card', 'card', 'card', 'cash', 'bank_transfer']),
              pr < 0.9 ? 'paid' : pr < 0.96 ? 'pending' : 'refunded',
              `TX-${100000 + apptId}`, pick(staffIds), end.toISOString(),
            );
          }
          hour = end.getHours() + (end.getMinutes() > 0 ? 1 : 0);
        }
      }
    }

    const log = db.prepare(`INSERT INTO audit_log (actor_id, action, entity, entity_id, ip, created_at) VALUES (?, ?, 'user', ?, '127.0.0.1', ?)`);
    for (const id of clientIds.slice(0, 8)) log.run(id, 'login', id, daysAgo(rand() * 5));
    for (let i = 0; i < 5; i++) log.run(clientIds[5], 'login_failed', clientIds[5], daysAgo(0.005 * (5 - i)));
    log.run(clientIds[5], 'account_locked', clientIds[5], daysAgo(0.001));
    log.run(1, 'deactivate_account', clientIds[13], daysAgo(3));
    db.prepare(`INSERT OR REPLACE INTO meta (key, value) VALUES ('data_epoch', ?)`).run(crypto.randomUUID());
  })();

  const count = (t: string) => db.prepare(`SELECT COUNT(*) FROM ${t}`).pluck().get() as number;
  return { users: count('users'), appointments: count('appointments'), payments: count('payments') };
}

let nextResetAt: Date | null = null;

/** Demo mode: start from fresh data now, then again every `demoResetMinutes`. */
export function startDemoResets() {
  const reset = () => {
    const c = seedDemoData();
    nextResetAt = new Date(Date.now() + config.demoResetMinutes * 60_000);
    console.log(`[demo] data reset (${c.users} users, ${c.appointments} appointments); next reset ${nextResetAt.toISOString()}`);
  };
  reset();
  setInterval(reset, config.demoResetMinutes * 60_000);
}

export function demoStatus() {
  return config.demoMode
    ? { demoMode: true, resetMinutes: config.demoResetMinutes, nextResetAt: nextResetAt?.toISOString() ?? null, accounts: DEMO_ACCOUNTS }
    : { demoMode: false };
}
