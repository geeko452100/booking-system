import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

fs.mkdirSync(path.dirname(config.dbFile), { recursive: true });

export const db = new Database(config.dbFile);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const NOW = `(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`;

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL,
  phone         TEXT,
  role          TEXT NOT NULL CHECK (role IN ('admin','staff','client')),
  is_active     INTEGER NOT NULL DEFAULT 1,
  failed_logins INTEGER NOT NULL DEFAULT 0,
  locked_until  TEXT,
  must_change_password INTEGER NOT NULL DEFAULT 0,
  last_login_at TEXT,
  notes         TEXT,
  created_at    TEXT NOT NULL DEFAULT ${NOW}
);

CREATE TABLE IF NOT EXISTS services (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT NOT NULL,
  description  TEXT,
  duration_min INTEGER NOT NULL CHECK (duration_min > 0),
  price_cents  INTEGER NOT NULL CHECK (price_cents >= 0),
  is_active    INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS appointments (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id  INTEGER NOT NULL REFERENCES users(id),
  staff_id   INTEGER REFERENCES users(id),
  service_id INTEGER NOT NULL REFERENCES services(id),
  start_at   TEXT NOT NULL,
  end_at     TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'scheduled'
             CHECK (status IN ('scheduled','completed','cancelled','no_show')),
  notes      TEXT,
  created_at TEXT NOT NULL DEFAULT ${NOW}
);
CREATE INDEX IF NOT EXISTS idx_appointments_start  ON appointments(start_at);
CREATE INDEX IF NOT EXISTS idx_appointments_client ON appointments(client_id);

-- Payment records only. Card numbers are never stored here; use a payment
-- processor (e.g. Stripe) and keep its transaction id in "reference".
CREATE TABLE IF NOT EXISTS payments (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id      INTEGER NOT NULL REFERENCES users(id),
  appointment_id INTEGER REFERENCES appointments(id),
  amount_cents   INTEGER NOT NULL CHECK (amount_cents > 0),
  method         TEXT NOT NULL CHECK (method IN ('card','cash','bank_transfer','other')),
  status         TEXT NOT NULL DEFAULT 'paid' CHECK (status IN ('pending','paid','refunded','failed')),
  reference      TEXT,
  recorded_by    INTEGER REFERENCES users(id),
  paid_at        TEXT NOT NULL,
  created_at     TEXT NOT NULL DEFAULT ${NOW}
);
CREATE INDEX IF NOT EXISTS idx_payments_client  ON payments(client_id);
CREATE INDEX IF NOT EXISTS idx_payments_paid_at ON payments(paid_at);

CREATE TABLE IF NOT EXISTS audit_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id   INTEGER REFERENCES users(id),
  action     TEXT NOT NULL,
  entity     TEXT NOT NULL,
  entity_id  INTEGER,
  details    TEXT,
  ip         TEXT,
  created_at TEXT NOT NULL DEFAULT ${NOW}
);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity, entity_id);

CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`);
