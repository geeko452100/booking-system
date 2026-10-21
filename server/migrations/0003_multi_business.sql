-- One app, several business types (home services, salon, fitness, pet grooming).
-- Every business-specific row carries `biz`; users (clients and staff) are shared across types.
--
-- The client portal tables from 0002 only ever held demo data, so they are recreated rather than
-- migrated. Existing services, appointments and payments are assigned to 'home'; run the demo
-- reset (npm run seed:remote) afterwards to load data for every business type.

DROP TABLE documents;
DROP TABLE matters;
DROP TABLE messages;

ALTER TABLE services ADD COLUMN biz TEXT NOT NULL DEFAULT 'home';
ALTER TABLE appointments ADD COLUMN biz TEXT NOT NULL DEFAULT 'home';
ALTER TABLE payments ADD COLUMN biz TEXT NOT NULL DEFAULT 'home';
CREATE INDEX idx_services_biz ON services(biz);
CREATE INDEX idx_appointments_biz_start ON appointments(biz, start_at);
CREATE INDEX idx_payments_biz_paid_at ON payments(biz, paid_at);

-- Staff titles and photos differ by business ("Lead Groomer" vs "Senior Barber"), so they move
-- out of users into a per-business profile.
ALTER TABLE users DROP COLUMN title;
ALTER TABLE users DROP COLUMN photo;
CREATE TABLE staff_profiles (
  user_id INTEGER NOT NULL REFERENCES users(id),
  biz     TEXT NOT NULL,
  title   TEXT,
  -- Headshot file name in /img/<biz>/team/.
  photo   TEXT,
  PRIMARY KEY (user_id, biz)
);

-- Tracked pieces of work: a repair job, a training program. Stage labels come from the business type.
CREATE TABLE projects (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  biz        TEXT NOT NULL,
  client_id  INTEGER NOT NULL REFERENCES users(id),
  staff_id   INTEGER REFERENCES users(id),
  title      TEXT NOT NULL,
  kind       TEXT NOT NULL,
  stage      TEXT NOT NULL DEFAULT 'new' CHECK (stage IN ('new','planning','active','review','done')),
  next_step  TEXT,
  next_date  TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_projects_biz_client ON projects(biz, client_id);

-- Document metadata only: this is a demo, so file contents are never uploaded or stored.
-- Categories depend on the business type, so they are validated by the API rather than here.
CREATE TABLE documents (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  biz         TEXT NOT NULL,
  client_id   INTEGER NOT NULL REFERENCES users(id),
  project_id  INTEGER REFERENCES projects(id),
  name        TEXT NOT NULL,
  category    TEXT NOT NULL,
  status      TEXT NOT NULL CHECK (status IN ('requested','received','reviewed','shared')),
  file_name   TEXT,
  size_bytes  INTEGER,
  note        TEXT,
  created_by  INTEGER REFERENCES users(id),
  uploaded_at TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_documents_biz_client ON documents(biz, client_id);

-- One thread per client per business. read_at is set when the other side opens the thread.
CREATE TABLE messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  biz        TEXT NOT NULL,
  client_id  INTEGER NOT NULL REFERENCES users(id),
  sender_id  INTEGER NOT NULL REFERENCES users(id),
  body       TEXT NOT NULL,
  read_at    TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_messages_biz_client ON messages(biz, client_id, created_at);

-- The site's business type, chosen by the owner in Settings.
INSERT OR IGNORE INTO meta (key, value) VALUES ('business_type', 'home');
