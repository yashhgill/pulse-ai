-- Pulse AI schema (SQLite dialect: Cloudflare D1 in the cloud, node:sqlite on an ECS)

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'member',   -- member | dispatcher | admin
  phone         TEXT,
  blood         TEXT,
  allergies     TEXT,
  conditions    TEXT,
  home_address  TEXT,
  home_lat      REAL,
  home_lng      REAL,
  consent_location INTEGER NOT NULL DEFAULT 1,
  consent_health   INTEGER NOT NULL DEFAULT 1,
  consent_contacts INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS contacts (
  id        TEXT PRIMARY KEY,
  user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name      TEXT NOT NULL,
  relation  TEXT,
  phone     TEXT NOT NULL,
  is_primary INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS medications (
  id        TEXT PRIMARY KEY,
  user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name      TEXT NOT NULL,
  dose      TEXT,
  time      TEXT,
  taken_on  TEXT            -- YYYY-MM-DD of the last day it was marked taken
);

CREATE TABLE IF NOT EXISTS vitals (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  hr        REAL, spo2 REAL, temp REAL, steps INTEGER,
  source    TEXT DEFAULT 'watch',
  at        TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Emergency incidents. Stage timeline is enforced on the server:
-- checking (10 s) -> escalating (30 s) -> alerted, unless the user responds.
CREATE TABLE IF NOT EXISTS incidents (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL,          -- fall | crash | syncope | inactivity | manual_sos | conversation
  label         TEXT,
  confidence    REAL,
  contributions TEXT DEFAULT '[]',      -- JSON
  stage         TEXT NOT NULL DEFAULT 'checking', -- checking | escalating | alerted | cancelled | resolved
  conscious     INTEGER,               -- NULL unknown, 1 responded, 0 unresponsive
  lat REAL, lng REAL, accuracy_m REAL,
  vitals        TEXT,                   -- JSON snapshot at detection
  speed         REAL DEFAULT 1,         -- demo time multiplier (3 = fast timers)
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  alerted_at    TEXT,
  ack_by        TEXT,
  ack_at        TEXT,
  resolved_at   TEXT,
  notes         TEXT
);

CREATE TABLE IF NOT EXISTS notifications (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  incident_id TEXT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  channel     TEXT NOT NULL,            -- mers999 | sms | call
  target      TEXT NOT NULL,
  status      TEXT NOT NULL,            -- simulated | sent | failed
  detail      TEXT,
  at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS appointments (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  clinic_id   TEXT NOT NULL,
  clinic_name TEXT NOT NULL,
  date        TEXT NOT NULL,
  time        TEXT NOT NULL,
  reason      TEXT,
  ref         TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'requested',
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS messages (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role      TEXT NOT NULL,              -- user | nova
  text      TEXT NOT NULL,
  urgency   TEXT,
  at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id   TEXT,
  kind      TEXT NOT NULL,              -- nova | safety | health | booking | system | dispatch
  text      TEXT NOT NULL,
  at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_contacts_user  ON contacts(user_id);
CREATE INDEX IF NOT EXISTS idx_meds_user      ON medications(user_id);
CREATE INDEX IF NOT EXISTS idx_vitals_user    ON vitals(user_id, at);
CREATE INDEX IF NOT EXISTS idx_incident_stage ON incidents(stage, created_at);
CREATE INDEX IF NOT EXISTS idx_incident_user  ON incidents(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_user     ON audit(user_id, at);
