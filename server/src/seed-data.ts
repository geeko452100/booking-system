/**
 * Builds the demo data as plain SQL statements. Pure (no Worker APIs), so the same data can be
 * loaded by the Worker's reset job and by `npm run seed` through `wrangler d1 execute`.
 */

/** The shared logins advertised on the sign-in page. */
export const DEMO_ACCOUNTS = [
  { role: 'Admin', email: 'admin@example.com', password: 'Admin123!' },
  { role: 'Staff', email: 'sam@example.com', password: 'Staff123!' },
  { role: 'Client', email: 'client@example.com', password: 'Client123!' },
];

// PBKDF2 hashes of the public demo passwords above, precomputed so a reset costs no hashing CPU.
const HASHES = {
  admin: 'pbkdf2-sha256$100000$rc5msH51iTnHlI8f+ORn5A==$8aCKfnpQwrw4pNuKy27rkuIWk7hYsrSGTTTe7nkaOm0=',
  staff: 'pbkdf2-sha256$100000$ca29izbNUPCZUeh/xp/AeA==$mRNU68EtkMNC9M1Iy9pA4nyflRdhE4+Ke6BogkZoeWs=',
  client: 'pbkdf2-sha256$100000$NOkhpmJ3T7ssyYJRCEx7vA==$JJkLMu6N9tO+vihNnHthoURmYpySWonNxUbz0ymT4+4=',
};

const DAY = 86_400_000;
const ROWS_PER_INSERT = 150; // keeps each statement well under D1's 100 KB limit

type Value = string | number | null;
const lit = (v: Value) => (v === null ? 'NULL' : typeof v === 'number' ? String(v) : `'${v.replace(/'/g, "''")}'`);

function insert(table: string, columns: string[], rows: Value[][]) {
  const out: string[] = [];
  for (let i = 0; i < rows.length; i += ROWS_PER_INSERT) {
    const values = rows.slice(i, i + ROWS_PER_INSERT).map((r) => `(${r.map(lit).join(', ')})`);
    out.push(`INSERT INTO ${table} (${columns.join(', ')}) VALUES\n${values.join(',\n')}`);
  }
  return out;
}

/** Minutes to add to UTC to get wall-clock time in `timeZone` at `date`. */
function tzOffsetMinutes(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  return (Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute')) - date.getTime()) / 60_000;
}

/** The UTC instant for a wall-clock time in `timeZone`. */
function zoned(y: number, m: number, d: number, minuteOfDay: number, timeZone: string) {
  const guess = Date.UTC(y, m, d, 0, minuteOfDay);
  return new Date(guess - tzOffsetMinutes(new Date(guess), timeZone) * 60_000);
}

export function buildSeedSql({ now = new Date(), timeZone = 'America/New_York', epoch }: { now?: Date; timeZone?: string; epoch: string }) {
  let seed = 42;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)];
  const iso = (ms: number) => new Date(ms).toISOString();
  const daysAgo = (d: number) => iso(now.getTime() - d * DAY);

  // Users. Ids are explicit so appointments and payments can reference them in the same batch.
  const users: Value[][] = [
    [1, 'admin@example.com', HASHES.admin, 'Alex Morgan', '555-0100', 'admin', 1, null, daysAgo(200), daysAgo(0)],
    [2, 'sam@example.com', HASHES.staff, 'Sam Rivera', '555-0101', 'staff', 1, null, daysAgo(180), daysAgo(1)],
    [3, 'jordan@example.com', HASHES.staff, 'Jordan Lee', '555-0102', 'staff', 1, null, daysAgo(150), daysAgo(2)],
  ];
  const staffIds = [2, 3];
  const clientNames = [
    'Priya Patel', 'Marcus Chen', 'Emily Walsh', 'David Okafor', 'Sofia Rossi', 'Liam Murphy', 'Hannah Kim',
    'Noah Schmidt', 'Olivia Brown', 'Ethan Nguyen', 'Ava Martinez', 'Lucas Dubois', 'Mia Johansson', 'Ben Carter',
  ];
  const clientIds = clientNames.map((name, i) => {
    const id = 4 + i;
    const email = i === 0 ? 'client@example.com' : `${name.toLowerCase().replace(' ', '.')}@example.com`;
    // A locked account and a deactivated one, so those states show up on the dashboard.
    const lockedUntil = i === 5 ? iso(now.getTime() + 10 * 60_000) : null;
    const active = i === 13 ? 0 : 1;
    users.push([id, email, HASHES.client, name, `555-01${20 + i}`, 'client', active, lockedUntil, daysAgo(120 - i * 8), daysAgo(i % 9)]);
    return id;
  });

  const services = [
    { id: 1, name: 'Initial consultation', desc: 'First visit including assessment', dur: 60, price: 9000 },
    { id: 2, name: 'Follow-up session', desc: 'Standard follow-up appointment', dur: 30, price: 5500 },
    { id: 3, name: 'Extended session', desc: 'Longer treatment session', dur: 90, price: 13000 },
    { id: 4, name: 'Group workshop', desc: 'Small-group session', dur: 120, price: 4000 },
    { id: 5, name: 'Quick check-in', desc: 'Short review', dur: 15, price: 2500 },
  ];

  // Each provider has a set of slots per day (Mon–Sat, 9am–5pm in `timeZone`), from 30 days ago to 14 days ahead.
  const appointments: Value[][] = [];
  const payments: Value[][] = [];
  const todayOffset = tzOffsetMinutes(now, timeZone);
  const localToday = new Date(now.getTime() + todayOffset * 60_000); // UTC fields hold the local calendar date
  for (let offset = -30; offset <= 14; offset++) {
    const day = new Date(Date.UTC(localToday.getUTCFullYear(), localToday.getUTCMonth(), localToday.getUTCDate() + offset));
    if (day.getUTCDay() === 0) continue;
    for (const staffId of staffIds) {
      let hour = 9;
      while (hour < 17) {
        if (rand() < 0.45) {
          hour += 1;
          continue;
        }
        const svc = pick(services);
        const startMin = hour * 60 + (rand() < 0.5 ? 0 : 30);
        const endMin = startMin + svc.dur;
        if (endMin > 17 * 60) break;
        const start = zoned(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), startMin, timeZone);
        const end = new Date(start.getTime() + svc.dur * 60_000);
        const clientId = pick(clientIds.slice(0, 13));
        const r = rand();
        const status =
          end < now ? (r < 0.82 ? 'completed' : r < 0.92 ? 'cancelled' : 'no_show') : r < 0.93 ? 'scheduled' : 'cancelled';
        const apptId = appointments.length + 1;
        appointments.push([apptId, clientId, staffId, svc.id, start.toISOString(), end.toISOString(), status, iso(start.getTime() - 7 * DAY)]);
        if (status === 'completed' && rand() < 0.88) {
          const pr = rand();
          payments.push([
            payments.length + 1, clientId, apptId, svc.price,
            pick(['card', 'card', 'card', 'cash', 'bank_transfer'] as const),
            pr < 0.9 ? 'paid' : pr < 0.96 ? 'pending' : 'refunded',
            `TX-${100000 + apptId}`, pick(staffIds), end.toISOString(),
          ]);
        }
        hour = Math.ceil(endMin / 60);
      }
    }
  }

  const audit: Value[][] = [];
  const log = (actor: number, action: string, subject: number, at: string) => audit.push([actor, action, 'user', subject, '127.0.0.1', at]);
  for (const id of clientIds.slice(0, 8)) log(id, 'login', id, daysAgo(rand() * 5));
  for (let i = 0; i < 5; i++) log(clientIds[5], 'login_failed', clientIds[5], daysAgo(0.005 * (5 - i)));
  log(clientIds[5], 'account_locked', clientIds[5], daysAgo(0.001));
  log(1, 'deactivate_account', clientIds[13], daysAgo(3));

  const statements = [
    'DELETE FROM audit_log',
    'DELETE FROM payments',
    'DELETE FROM appointments',
    'DELETE FROM services',
    'DELETE FROM users',
    ...insert('users', ['id', 'email', 'password_hash', 'name', 'phone', 'role', 'is_active', 'locked_until', 'created_at', 'last_login_at'], users),
    ...insert('services', ['id', 'name', 'description', 'duration_min', 'price_cents'], services.map((s) => [s.id, s.name, s.desc, s.dur, s.price])),
    ...insert('appointments', ['id', 'client_id', 'staff_id', 'service_id', 'start_at', 'end_at', 'status', 'created_at'], appointments),
    ...insert('payments', ['id', 'client_id', 'appointment_id', 'amount_cents', 'method', 'status', 'reference', 'recorded_by', 'paid_at'], payments),
    ...insert('audit_log', ['actor_id', 'action', 'entity', 'entity_id', 'ip', 'created_at'], audit),
    `INSERT OR REPLACE INTO meta (key, value) VALUES ('data_epoch', ${lit(epoch)}), ('last_reset_at', ${lit(now.toISOString())})`,
  ];
  return { statements, counts: { users: users.length, appointments: appointments.length, payments: payments.length } };
}
