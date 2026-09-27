// Writes the demo data to .wrangler/seed.sql for `wrangler d1 execute` (used by `npm run seed`).
import fs from 'node:fs';
import { buildSeedSql } from '../src/seed-data.js';

const { statements, counts } = buildSeedSql({ epoch: crypto.randomUUID(), timeZone: process.env.DEMO_TIMEZONE || undefined });
fs.mkdirSync('.wrangler', { recursive: true });
fs.writeFileSync('.wrangler/seed.sql', statements.join(';\n') + ';\n');
console.log(`Demo data: ${counts.users} users, ${counts.appointments} appointments, ${counts.payments} payments.`);
