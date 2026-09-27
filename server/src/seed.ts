/**
 * Resets the database and fills it with demo data.
 * Run with: npm run seed
 */
import { DEMO_ACCOUNTS, seedDemoData } from './lib/demo.js';

const c = seedDemoData();
console.log(`Seeded ${c.users} users, ${c.appointments} appointments, ${c.payments} payments.\n\nDemo logins:`);
for (const a of DEMO_ACCOUNTS) console.log(`  ${a.role.padEnd(7)} ${a.email.padEnd(20)} / ${a.password}`);
