import { BUSINESS_TYPES } from './business-types.js';
import { SEED, type StaffKey } from './seed-content.js';

/**
 * Builds the demo data, for every business type, as plain SQL statements. Pure (no Worker APIs), so the same data can be
 * loaded by the Worker's reset job and by `npm run seed` through `wrangler d1 execute`.
 */

/** The shared logins advertised on the sign-in page. */
export const DEMO_ACCOUNTS = [
  { role: 'Owner (admin)', email: 'admin@example.com', password: 'Admin123!' },
  { role: 'Team member (staff)', email: 'sam@example.com', password: 'Staff123!' },
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

  // Users are shared by every business type. Ids are explicit so other rows can reference them in the same batch.
  // Columns: id, email, hash, name, phone, role, active, locked_until, created_at, last_login_at, notes
  const users: Value[][] = [
    [1, 'admin@example.com', HASHES.admin, 'Eleanor Reid', '555-0100', 'admin', 1, null, daysAgo(200), daysAgo(0), null],
    [2, 'sam@example.com', HASHES.staff, 'Sam Rivera', '555-0101', 'staff', 1, null, daysAgo(180), daysAgo(1), null],
    [3, 'jordan@example.com', HASHES.staff, 'Jordan Lee', '555-0102', 'staff', 1, null, daysAgo(150), daysAgo(2), null],
  ];
  const staffIdOf: Record<StaffKey, number> = { eleanor: 1, sam: 2, jordan: 3 };
  const staffIds = [2, 3];
  const clientNames = [
    'Priya Patel', 'Marcus Chen', 'Emily Walsh', 'David Okafor', 'Sofia Rossi', 'Liam Murphy', 'Hannah Kim',
    'Noah Schmidt', 'Olivia Brown', 'Ethan Nguyen', 'Ava Martinez', 'Lucas Dubois', 'Mia Johansson', 'Ben Carter',
  ];
  const clientNotes: Record<number, string> = {
    0: 'Prefers text messages; available after 2pm. Referred by a neighbor.',
    1: 'Pays by card on file. Ask about the loyalty discount.',
    3: 'Prefers the earliest appointment of the day.',
  };
  const clientIds = clientNames.map((name, i) => {
    const id = 4 + i;
    const email = i === 0 ? 'client@example.com' : `${name.toLowerCase().replace(' ', '.')}@example.com`;
    // A locked account and a deactivated one, so those states show up on the dashboard.
    const lockedUntil = i === 5 ? iso(now.getTime() + 10 * 60_000) : null;
    const active = i === 13 ? 0 : 1;
    users.push([id, email, HASHES.client, name, `555-01${20 + i}`, 'client', active, lockedUntil, daysAgo(120 - i * 8), daysAgo(i % 9), clientNotes[i] ?? null]);
    return id;
  });
  const [priya] = clientIds;
  const lastName = (clientId: number) => clientNames[clientId - 4].split(' ')[1];

  const staffProfiles: Value[][] = [];
  const services: Value[][] = [];
  const appointments: Value[][] = [];
  const payments: Value[][] = [];
  const projects: Value[][] = [];
  const documents: Value[][] = [];
  const messages: Value[][] = [];

  const daysAhead = (d: number) => iso(now.getTime() + d * DAY);
  const todayOffset = tzOffsetMinutes(now, timeZone);
  const localToday = new Date(now.getTime() + todayOffset * 60_000); // UTC fields hold the local calendar date
  // Mostly open work, with a few finished pieces for history.
  const stageWeights = ['new', 'planning', 'planning', 'active', 'active', 'review', 'done'] as const;

  for (const [bizIndex, biz] of BUSINESS_TYPES.entries()) {
    seed = 42 + bizIndex * 7919; // each business gets its own, still repeatable, data
    const content = SEED[biz];

    for (const key of Object.keys(staffIdOf) as StaffKey[]) staffProfiles.push([staffIdOf[key], biz, content.team[key], key]);

    // Columns: id, biz, name, description, duration_min, price_cents, image
    const bizServices = content.services.map((s) => {
      const id = services.length + 1;
      services.push([id, biz, s.name, s.desc, s.dur, s.price, s.image]);
      return { ...s, id };
    });

    // Booking notes: a pet's name on every grooming booking (the same pet each time), otherwise an occasional note.
    const noteFor = (clientId: number) => {
      const notes = content.bookingNotes ?? [];
      if (clientId === priya && content.story.bookingNote) return content.story.bookingNote;
      if (content.notesOnEvery) return notes[(clientId - 4) % notes.length];
      return notes.length && rand() < 0.25 ? pick(notes) : null;
    };

    // Each team member has a set of slots per day (Mon–Sat, 9am–5pm in `timeZone`), from 30 days ago to 14 days ahead.
    const busy = new Map<number, [number, number][]>();
    // The demo client gets a believable number of upcoming bookings, and none that don't fit their story.
    let demoUpcoming = 0;
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
          const svc = pick(bizServices);
          const startMin = hour * 60 + (rand() < 0.5 ? 0 : 30);
          const endMin = startMin + svc.dur;
          if (endMin > 17 * 60) break;
          const start = zoned(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), startMin, timeZone);
          const end = new Date(start.getTime() + svc.dur * 60_000);
          // A client can only be in one booking at a time, even with different team members.
          const demoClientFits = !content.story.avoidServices?.includes(svc.name) && (start < now || demoUpcoming < 3);
          const free = clientIds
            .slice(0, 13)
            .filter((id) => id !== priya || demoClientFits)
            .filter((id) => !(busy.get(id) ?? []).some(([s, e]) => s < end.getTime() && e > start.getTime()));
          if (!free.length) break;
          const clientId = pick(free);
          if (clientId === priya && start > now) demoUpcoming++;
          busy.set(clientId, [...(busy.get(clientId) ?? []), [start.getTime(), end.getTime()]]);
          const r = rand();
          const status =
            end < now ? (r < 0.82 ? 'completed' : r < 0.92 ? 'cancelled' : 'no_show') : r < 0.93 ? 'scheduled' : 'cancelled';
          const apptId = appointments.length + 1;
          // Columns: id, biz, client_id, staff_id, service_id, start_at, end_at, status, notes, created_at
          appointments.push([
            apptId, biz, clientId, staffId, svc.id, start.toISOString(), end.toISOString(), status, noteFor(clientId),
            iso(start.getTime() - 7 * DAY),
          ]);
          if (status === 'completed' && svc.price > 0 && rand() < 0.88) {
            const pr = rand();
            // Columns: id, biz, client_id, appointment_id, amount_cents, method, status, reference, recorded_by, paid_at
            payments.push([
              payments.length + 1, biz, clientId, apptId, svc.price,
              pick(['card', 'card', 'card', 'cash', 'bank_transfer'] as const),
              pr < 0.9 ? 'paid' : pr < 0.96 ? 'pending' : 'refunded',
              `INV-${20000 + apptId}`, pick(staffIds), end.toISOString(),
            ]);
          }
          hour = Math.ceil(endMin / 60);
        }
      }
    }

    // Projects. Columns: id, biz, client_id, staff_id, title, kind, stage, next_step, next_date, updated_at, created_at
    const storyProjectIds: number[] = [];
    const projectOf = new Map<number, { id: number; stage: string; staffId: number }>();
    if (content.projects) {
      for (const p of content.story.projects ?? []) {
        const id = projects.length + 1;
        storyProjectIds.push(id);
        projects.push([
          id, biz, priya, staffIdOf[p.staff], p.title, p.kind, p.stage, p.nextStep ?? null,
          p.nextInDays === undefined ? null : daysAhead(p.nextInDays), daysAgo(p.updatedAgo), daysAgo(p.createdAgo),
        ]);
      }
      for (const [i, clientId] of clientIds.slice(1, 13).entries()) {
        const t = content.projects.templates[i % content.projects.templates.length];
        const stage = pick(stageWeights);
        const id = projects.length + 1;
        const staffId = pick([1, ...staffIds]);
        projectOf.set(clientId, { id, stage, staffId });
        projects.push([
          id, biz, clientId, staffId, t.title(lastName(clientId)), t.kind, stage,
          content.projects.nextSteps[stage] ?? null, stage === 'done' ? null : daysAhead(3 + Math.floor(rand() * 40)),
          daysAgo(rand() * 10), daysAgo(20 + rand() * 120),
        ]);
      }
    }

    // Documents (metadata only). Columns: biz, client_id, project_id, name, category, status, file_name, size_bytes,
    // note, created_by, uploaded_at, created_at
    if (content.requestable) {
      for (const d of content.story.documents ?? []) {
        const fromClient = d.status === 'received' || d.status === 'reviewed';
        documents.push([
          biz, priya, d.project === undefined ? null : storyProjectIds[d.project], d.name, d.category, d.status,
          d.file ?? null, d.size ?? null, d.note ?? null, fromClient ? priya : staffIdOf[d.by ?? 'sam'],
          d.status === 'requested' ? null : daysAgo(d.ago), daysAgo(fromClient ? d.ago + 2 : d.ago),
        ]);
      }
      for (const clientId of clientIds.slice(1, 13)) {
        const project = projectOf.get(clientId);
        const finished = project?.stage === 'done';
        const a = pick(content.requestable);
        const b = pick(content.requestable);
        const askedBy = project?.staffId ?? pick(staffIds);
        documents.push(
          // Finished work has nothing outstanding.
          finished
            ? [biz, clientId, project.id, a.name, a.category, 'reviewed', a.file ?? null, Math.floor(40_000 + rand() * 2e6), null, clientId, daysAgo(20), daysAgo(25)]
            : [biz, clientId, project?.id ?? null, a.name, a.category, 'requested', null, null, null, askedBy, null, daysAgo(rand() * 6)],
          [biz, clientId, project?.id ?? null, b.name, b.category, rand() < 0.5 ? 'received' : 'reviewed', b.file ?? null,
            Math.floor(40_000 + rand() * 2e6), null, clientId, daysAgo(rand() * 8), daysAgo(10)],
        );
      }
    }

    // Messages. Columns: biz, client_id, sender_id, body, read_at, created_at
    for (const m of content.story.messages) {
      messages.push([biz, priya, m.from === 'client' ? priya : staffIdOf[m.from], m.body, m.unread ? null : daysAgo(m.ago - 0.05), daysAgo(m.ago)]);
    }
    for (const [i, clientId] of clientIds.slice(1, 9).entries()) {
      const at = 0.1 + rand() * 4;
      messages.push([biz, clientId, pick(staffIds), content.welcome, daysAgo(at + 3), daysAgo(at + 5)]);
      // Some threads end with an unread question from the client, so the staff inbox has work in it.
      messages.push([biz, clientId, clientId, content.inboxQuestions[i % content.inboxQuestions.length], i % 2 ? daysAgo(at - 0.05) : null, daysAgo(at)]);
    }
  }

  const audit: Value[][] = [];
  const log = (actor: number, action: string, subject: number, at: string) => audit.push([actor, action, 'user', subject, '127.0.0.1', at]);
  for (const id of clientIds.slice(0, 8)) log(id, 'login', id, daysAgo(rand() * 5));
  for (let i = 0; i < 5; i++) log(clientIds[5], 'login_failed', clientIds[5], daysAgo(0.005 * (5 - i)));
  log(clientIds[5], 'account_locked', clientIds[5], daysAgo(0.001));
  log(1, 'deactivate_account', clientIds[13], daysAgo(3));

  const statements = [
    'DELETE FROM messages',
    'DELETE FROM documents',
    'DELETE FROM projects',
    'DELETE FROM staff_profiles',
    'DELETE FROM audit_log',
    'DELETE FROM payments',
    'DELETE FROM appointments',
    'DELETE FROM services',
    'DELETE FROM users',
    ...insert('users', ['id', 'email', 'password_hash', 'name', 'phone', 'role', 'is_active', 'locked_until', 'created_at', 'last_login_at', 'notes'], users),
    ...insert('staff_profiles', ['user_id', 'biz', 'title', 'photo'], staffProfiles),
    ...insert('services', ['id', 'biz', 'name', 'description', 'duration_min', 'price_cents', 'image'], services),
    ...insert('appointments', ['id', 'biz', 'client_id', 'staff_id', 'service_id', 'start_at', 'end_at', 'status', 'notes', 'created_at'], appointments),
    ...insert('payments', ['id', 'biz', 'client_id', 'appointment_id', 'amount_cents', 'method', 'status', 'reference', 'recorded_by', 'paid_at'], payments),
    ...insert('projects', ['id', 'biz', 'client_id', 'staff_id', 'title', 'kind', 'stage', 'next_step', 'next_date', 'updated_at', 'created_at'], projects),
    ...insert('documents', ['biz', 'client_id', 'project_id', 'name', 'category', 'status', 'file_name', 'size_bytes', 'note', 'created_by', 'uploaded_at', 'created_at'], documents),
    ...insert('messages', ['biz', 'client_id', 'sender_id', 'body', 'read_at', 'created_at'], messages),
    ...insert('audit_log', ['actor_id', 'action', 'entity', 'entity_id', 'ip', 'created_at'], audit),
    `INSERT OR REPLACE INTO meta (key, value) VALUES ('data_epoch', ${lit(epoch)}), ('last_reset_at', ${lit(now.toISOString())})`,
  ];
  return {
    statements,
    counts: { users: users.length, appointments: appointments.length, payments: payments.length, projects: projects.length },
  };
}
