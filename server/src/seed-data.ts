/**
 * Builds the demo data as plain SQL statements. Pure (no Worker APIs), so the same data can be
 * loaded by the Worker's reset job and by `npm run seed` through `wrangler d1 execute`.
 */

/** The shared logins advertised on the sign-in page. */
export const DEMO_ACCOUNTS = [
  { role: 'Partner (admin)', email: 'admin@example.com', password: 'Admin123!' },
  { role: 'Attorney (staff)', email: 'sam@example.com', password: 'Staff123!' },
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
  // Columns: id, email, hash, name, phone, role, active, locked_until, created_at, last_login_at, title, photo, notes
  const users: Value[][] = [
    [1, 'admin@example.com', HASHES.admin, 'Eleanor Reid', '555-0100', 'admin', 1, null, daysAgo(200), daysAgo(0), 'Managing Partner', 'eleanor-reid', null],
    [2, 'sam@example.com', HASHES.staff, 'Sam Rivera', '555-0101', 'staff', 1, null, daysAgo(180), daysAgo(1), 'Senior Associate', 'sam-rivera', null],
    [3, 'jordan@example.com', HASHES.staff, 'Jordan Lee', '555-0102', 'staff', 1, null, daysAgo(150), daysAgo(2), 'Associate Attorney', 'jordan-lee', null],
  ];
  const staffIds = [2, 3];
  const clientNames = [
    'Priya Patel', 'Marcus Chen', 'Emily Walsh', 'David Okafor', 'Sofia Rossi', 'Liam Murphy', 'Hannah Kim',
    'Noah Schmidt', 'Olivia Brown', 'Ethan Nguyen', 'Ava Martinez', 'Lucas Dubois', 'Mia Johansson', 'Ben Carter',
  ];
  const clientNotes: Record<number, string> = {
    0: 'Owner of Patel Design Studio. Prefers email; available after 2pm. Conflict check cleared.',
    1: 'Referred by Hannah Kim. Offer an interpreter for joint meetings with spouse.',
    3: 'Retainer on file. Opposing party represented by counsel.',
  };
  const clientIds = clientNames.map((name, i) => {
    const id = 4 + i;
    const email = i === 0 ? 'client@example.com' : `${name.toLowerCase().replace(' ', '.')}@example.com`;
    // A locked account and a deactivated one, so those states show up on the dashboard.
    const lockedUntil = i === 5 ? iso(now.getTime() + 10 * 60_000) : null;
    const active = i === 13 ? 0 : 1;
    users.push([
      id, email, HASHES.client, name, `555-01${20 + i}`, 'client', active, lockedUntil, daysAgo(120 - i * 8), daysAgo(i % 9),
      null, null, clientNotes[i] ?? null,
    ]);
    return id;
  });

  // Consultation types. `image` names a photo in client/public/img/practice.
  const services = [
    { id: 1, name: 'Initial consultation', desc: 'Meet an attorney to talk through your situation and options', dur: 60, price: 15000, image: 'consultation' },
    { id: 2, name: 'Contract review', desc: 'Line-by-line review of a business, lease or employment contract', dur: 60, price: 35000, image: 'contracts' },
    { id: 3, name: 'Estate planning meeting', desc: 'Wills, trusts, guardianship and powers of attorney', dur: 90, price: 45000, image: 'estate' },
    { id: 4, name: 'Litigation strategy session', desc: 'Case assessment, evidence review and next steps in a dispute', dur: 90, price: 60000, image: 'litigation' },
    { id: 5, name: 'Document signing review', desc: 'Walk through drafted documents together before you sign', dur: 30, price: 17500, image: 'drafting' },
    { id: 6, name: 'Mediation preparation', desc: 'Prepare your position for mediation or settlement talks', dur: 120, price: 80000, image: 'disputes' },
  ];

  // Each provider has a set of slots per day (Mon–Sat, 9am–5pm in `timeZone`), from 30 days ago to 14 days ahead.
  const appointments: Value[][] = [];
  const payments: Value[][] = [];
  const busy = new Map<number, [number, number][]>();
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
        // A client can only be in one meeting at a time, even with different attorneys.
        const free = clientIds.slice(0, 13).filter((id) => !(busy.get(id) ?? []).some(([s, e]) => s < end.getTime() && e > start.getTime()));
        if (!free.length) break;
        const clientId = pick(free);
        busy.set(clientId, [...(busy.get(clientId) ?? []), [start.getTime(), end.getTime()]]);
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
            `INV-${20000 + apptId}`, pick(staffIds), end.toISOString(),
          ]);
        }
        hour = Math.ceil(endMin / 60);
      }
    }
  }

  // Matters (cases). The demo client gets a hand-written set so the portal tells a clear story.
  // Columns: id, client_id, staff_id, title, practice, stage, next_step, next_date, updated_at, created_at
  const daysAhead = (d: number) => iso(now.getTime() + d * DAY);
  const [priya] = clientIds;
  const matters: Value[][] = [
    [1, priya, 2, 'Patel v. Northgate Property Group', 'Commercial lease dispute', 'negotiation', 'Review the draft settlement agreement', daysAhead(6), daysAgo(0.2), daysAgo(64)],
    [2, priya, 3, 'Patel family estate plan', 'Estate planning', 'investigation', 'Send a list of assets and accounts', daysAhead(14), daysAgo(3), daysAgo(21)],
    [3, priya, 1, 'Trademark registration: Patel Design Studio', 'Intellectual property', 'closed', null, null, daysAgo(40), daysAgo(150)],
  ];
  const matterTemplates = [
    { title: (last: string) => `${last} v. Harlow Freight Lines`, practice: 'Personal injury' },
    { title: (last: string) => `${last} custody and support`, practice: 'Family law' },
    { title: (last: string) => `${last} wrongful termination claim`, practice: 'Employment law' },
    { title: (last: string) => `${last} family estate plan`, practice: 'Estate planning' },
    { title: (last: string) => `Purchase of 14 Linden Row (${last})`, practice: 'Real estate' },
    { title: (last: string) => `${last} LLC partnership agreement`, practice: 'Business law' },
  ];
  // Mostly open matters, with a few closed ones for history.
  const stageWeights = ['intake', 'investigation', 'investigation', 'negotiation', 'negotiation', 'resolution', 'closed'] as const;
  const nextSteps: Record<string, string> = {
    intake: 'Sign and return the engagement letter',
    investigation: 'Gather records and witness details',
    negotiation: "Respond to opposing counsel's offer",
    resolution: 'Final signing appointment',
  };
  for (const [i, clientId] of clientIds.slice(1, 13).entries()) {
    const last = clientNames[i + 1].split(' ')[1];
    const t = matterTemplates[i % matterTemplates.length];
    const stage = pick(stageWeights);
    matters.push([
      matters.length + 1, clientId, pick([1, ...staffIds]), t.title(last), t.practice, stage,
      nextSteps[stage] ?? null, stage === 'closed' ? null : daysAhead(3 + Math.floor(rand() * 40)),
      daysAgo(rand() * 10), daysAgo(20 + rand() * 120),
    ]);
  }

  // Documents (metadata only). Columns: client_id, matter_id, name, category, status, file_name, size_bytes, note,
  // created_by, uploaded_at, created_at
  const documents: Value[][] = [
    [priya, 1, 'Signed lease, all pages', 'contract', 'requested', null, null, 'Please include the 2024 amendment if you can find it.', 2, null, daysAgo(3)],
    [priya, 1, 'Photos of the water damage', 'evidence', 'requested', null, null, 'Date-stamped photos if possible.', 2, null, daysAgo(3)],
    [priya, 2, 'List of assets and accounts', 'financial', 'requested', null, null, 'Use the worksheet in the estate planning questionnaire.', 3, null, daysAgo(2)],
    [priya, 1, 'Rent payment records 2025–2026', 'financial', 'received', 'rent-ledger-2025-2026.xlsx', 48_210, null, priya, daysAgo(1.6), daysAgo(9)],
    [priya, 1, 'Email thread with the landlord', 'correspondence', 'reviewed', 'landlord-emails.pdf', 312_400, null, priya, daysAgo(30), daysAgo(32)],
    [priya, null, "Driver's license", 'identification', 'reviewed', 'drivers-license.jpg', 1_204_220, null, priya, daysAgo(62), daysAgo(64)],
    [priya, null, 'Engagement letter', 'correspondence', 'shared', 'Engagement-Letter-Patel.pdf', 182_330, null, 1, daysAgo(63), daysAgo(63)],
    [priya, 1, 'Demand letter (as sent)', 'correspondence', 'shared', 'Demand-Letter-Northgate.pdf', 96_450, null, 2, daysAgo(12), daysAgo(12)],
    [priya, 1, 'Draft settlement agreement v2', 'contract', 'shared', 'Settlement-Agreement-DRAFT-v2.docx', 64_900, 'Please read sections 4 and 7 before our meeting.', 2, daysAgo(0.2), daysAgo(0.2)],
    [priya, 2, 'Estate planning questionnaire', 'other', 'shared', 'Estate-Planning-Questionnaire.pdf', 140_120, null, 3, daysAgo(20), daysAgo(20)],
    [priya, 3, 'USPTO registration certificate', 'court_filing', 'shared', 'Trademark-Certificate.pdf', 402_870, null, 1, daysAgo(40), daysAgo(40)],
  ];
  const otherDocs = [
    { name: 'Photo ID', category: 'identification', file: 'photo-id.jpg' },
    { name: 'Pay stubs, last 3 months', category: 'financial', file: 'paystubs.pdf' },
    { name: 'Police report', category: 'evidence', file: 'police-report.pdf' },
    { name: 'Medical bills', category: 'financial', file: 'medical-bills.pdf' },
    { name: 'Employment contract', category: 'contract', file: 'employment-contract.pdf' },
    { name: 'Text messages (screenshots)', category: 'evidence', file: 'texts.zip' },
  ] as const;
  for (const m of matters.slice(3)) {
    const [matterId, clientId, staffId, , , stage] = m as [number, number, number, string, string, string];
    const a = pick(otherDocs);
    const closed = stage === 'closed';
    const b = pick(otherDocs);
    documents.push(
      closed
        ? [clientId, matterId, a.name, a.category, 'reviewed', a.file, Math.floor(40_000 + rand() * 2e6), null, clientId, daysAgo(20), daysAgo(25)]
        : [clientId, matterId, a.name, a.category, 'requested', null, null, null, staffId, null, daysAgo(rand() * 6)],
      [clientId, matterId, b.name, b.category, rand() < 0.5 ? 'received' : 'reviewed', b.file, Math.floor(40_000 + rand() * 2e6), null, clientId, daysAgo(rand() * 8), daysAgo(10)],
      [clientId, null, 'Engagement letter', 'correspondence', 'shared', 'Engagement-Letter.pdf', 180_000, null, 1, daysAgo(30), daysAgo(30)],
    );
  }

  // Messages. Columns: client_id, sender_id, body, read_at, created_at
  const messages: Value[][] = [
    [priya, 3, "Hi Priya, Jordan here. I'm starting on your estate plan and have shared a questionnaire in Documents. No rush, but we need the asset list before we can draft.", daysAgo(19), daysAgo(20)],
    [priya, 2, "Hi Priya, I sent the demand letter to Northgate's counsel this morning. They have 14 days to respond, and I'll let you know as soon as I hear anything.", daysAgo(11.9), daysAgo(12)],
    [priya, priya, 'Thanks Sam. Do you still need the 2024 lease amendment? I think I have a scanned copy somewhere.', daysAgo(10.9), daysAgo(11)],
    [priya, 2, 'Yes please. Upload it under Documents when you find it. It helps our argument on the repair clause.', daysAgo(10), daysAgo(10.8)],
    [priya, 2, "Good news: Northgate's counsel replied and they're open to settling. I've shared a draft agreement in Documents. Let's go through it together at our next meeting.", null, daysAgo(0.2)],
  ];
  const clientQuestions = [
    'Hi, has the hearing date been confirmed yet?',
    'Quick question about my last invoice. Does it include the filing fee?',
    "I've uploaded the documents you asked for. Let me know if anything else is needed.",
    'Can we move our meeting to later in the week?',
    'The other side contacted me directly. Should I respond?',
  ];
  for (const [i, clientId] of clientIds.slice(1, 9).entries()) {
    const at = 0.1 + rand() * 4;
    messages.push([clientId, pick(staffIds), 'Thanks for meeting with us. We have opened your file and will be in touch with next steps.', daysAgo(at + 3), daysAgo(at + 5)]);
    // Some threads end with an unread question from the client, so the staff inbox has work in it.
    messages.push([clientId, clientId, clientQuestions[i % clientQuestions.length], i % 2 ? daysAgo(at - 0.05) : null, daysAgo(at)]);
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
    'DELETE FROM matters',
    'DELETE FROM audit_log',
    'DELETE FROM payments',
    'DELETE FROM appointments',
    'DELETE FROM services',
    'DELETE FROM users',
    ...insert('users', ['id', 'email', 'password_hash', 'name', 'phone', 'role', 'is_active', 'locked_until', 'created_at', 'last_login_at', 'title', 'photo', 'notes'], users),
    ...insert('services', ['id', 'name', 'description', 'duration_min', 'price_cents', 'image'], services.map((s) => [s.id, s.name, s.desc, s.dur, s.price, s.image])),
    ...insert('appointments', ['id', 'client_id', 'staff_id', 'service_id', 'start_at', 'end_at', 'status', 'created_at'], appointments),
    ...insert('payments', ['id', 'client_id', 'appointment_id', 'amount_cents', 'method', 'status', 'reference', 'recorded_by', 'paid_at'], payments),
    ...insert('matters', ['id', 'client_id', 'staff_id', 'title', 'practice', 'stage', 'next_step', 'next_date', 'updated_at', 'created_at'], matters),
    ...insert('documents', ['client_id', 'matter_id', 'name', 'category', 'status', 'file_name', 'size_bytes', 'note', 'created_by', 'uploaded_at', 'created_at'], documents),
    ...insert('messages', ['client_id', 'sender_id', 'body', 'read_at', 'created_at'], messages),
    ...insert('audit_log', ['actor_id', 'action', 'entity', 'entity_id', 'ip', 'created_at'], audit),
    `INSERT OR REPLACE INTO meta (key, value) VALUES ('data_epoch', ${lit(epoch)}), ('last_reset_at', ${lit(now.toISOString())})`,
  ];
  return {
    statements,
    counts: { users: users.length, appointments: appointments.length, payments: payments.length, matters: matters.length },
  };
}
