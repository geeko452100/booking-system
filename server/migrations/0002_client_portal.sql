-- Client portal for a (fictional) law firm: legal matters with a stage tracker, document exchange and secure messages.

-- Photo shown on the practice-area card; a path under the site's /img/practice/ folder.
ALTER TABLE services ADD COLUMN image TEXT;

-- Attorney headshot (path under /img/team/) and job title, shown to clients.
ALTER TABLE users ADD COLUMN photo TEXT;
ALTER TABLE users ADD COLUMN title TEXT;

CREATE TABLE matters (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id  INTEGER NOT NULL REFERENCES users(id),
  staff_id   INTEGER REFERENCES users(id),
  title      TEXT NOT NULL,
  practice   TEXT NOT NULL,
  stage      TEXT NOT NULL DEFAULT 'intake'
             CHECK (stage IN ('intake','investigation','negotiation','resolution','closed')),
  next_step  TEXT,
  next_date  TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_matters_client ON matters(client_id);

-- Document metadata only: this is a demo, so file contents are never uploaded or stored.
-- "requested" = the firm asked the client for it; "received" = the client uploaded it;
-- "reviewed" = an attorney checked it; "shared" = the firm shared it with the client.
CREATE TABLE documents (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id   INTEGER NOT NULL REFERENCES users(id),
  matter_id   INTEGER REFERENCES matters(id),
  name        TEXT NOT NULL,
  category    TEXT NOT NULL
              CHECK (category IN ('identification','contract','evidence','court_filing','correspondence','financial','other')),
  status      TEXT NOT NULL CHECK (status IN ('requested','received','reviewed','shared')),
  file_name   TEXT,
  size_bytes  INTEGER,
  note        TEXT,
  created_by  INTEGER REFERENCES users(id),
  uploaded_at TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_documents_client ON documents(client_id);

-- One thread per client. read_at is set when the other side opens the thread.
CREATE TABLE messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id  INTEGER NOT NULL REFERENCES users(id),
  sender_id  INTEGER NOT NULL REFERENCES users(id),
  body       TEXT NOT NULL,
  read_at    TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_messages_client ON messages(client_id, created_at);
