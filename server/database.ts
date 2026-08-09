import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

export type VaultboardDatabase = Database.Database;

const schema = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  csrf_token TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS servers (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  hostname TEXT NOT NULL DEFAULT '',
  ip_address TEXT NOT NULL DEFAULT '',
  operating_system TEXT NOT NULL DEFAULT '',
  provider TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL COLLATE NOCASE,
  color TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(user_id, name)
);

CREATE TABLE IF NOT EXISTS server_tags (
  server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY(server_id, tag_id)
);

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL COLLATE NOCASE,
  color TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(user_id, name)
);

CREATE TABLE IF NOT EXISTS services (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  url TEXT NOT NULL DEFAULT '',
  port INTEGER,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'unknown' CHECK(status IN ('operational','degraded','down','maintenance','unknown')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_servers_user_name ON servers(user_id, name);
CREATE INDEX IF NOT EXISTS idx_services_user_name ON services(user_id, name);
CREATE INDEX IF NOT EXISTS idx_services_server_id ON services(server_id);
CREATE INDEX IF NOT EXISTS idx_services_category_id ON services(category_id);
CREATE INDEX IF NOT EXISTS idx_server_tags_tag_id ON server_tags(tag_id);
`;

export function openDatabase(filename: string): VaultboardDatabase {
  if (filename !== ":memory:") {
    fs.mkdirSync(path.dirname(filename), { recursive: true });
  }

  const db = new Database(filename);
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  if (filename !== ":memory:") db.pragma("journal_mode = WAL");
  db.exec(schema);
  db.pragma("optimize");
  return db;
}

export function seedAccountDefaults(db: VaultboardDatabase, userId: string) {
  const now = new Date().toISOString();
  const categories = [
    ["Web", "#5b8def"],
    ["Database", "#9b7af3"],
    ["Monitoring", "#2bb8a3"],
    ["Automation", "#f59e5b"],
  ];
  const tags = [
    ["Production", "#ec6a79"],
    ["Staging", "#f0a85c"],
    ["Homelab", "#60a5fa"],
  ];
  const insertCategory = db.prepare(
    "INSERT INTO categories (id, user_id, name, color, created_at) VALUES (?, ?, ?, ?, ?)",
  );
  const insertTag = db.prepare(
    "INSERT INTO tags (id, user_id, name, color, created_at) VALUES (?, ?, ?, ?, ?)",
  );
  const transaction = db.transaction(() => {
    for (const [name, color] of categories) {
      insertCategory.run(crypto.randomUUID(), userId, name, color, now);
    }
    for (const [name, color] of tags) {
      insertTag.run(crypto.randomUUID(), userId, name, color, now);
    }
  });
  transaction();
}
