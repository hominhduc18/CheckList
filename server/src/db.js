import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');
const uploadDir = path.join(dataDir, 'uploads');
const reportDir = path.join(dataDir, 'reports');
const backupDir = path.join(dataDir, 'backups');

for (const dir of [dataDir, uploadDir, reportDir, backupDir]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const dbPath = path.join(dataDir, 'checklist.db');
export const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

/** Khởi tạo bảng nếu chưa có */
export function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS departments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      is_visible INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS rooms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      department_id INTEGER NOT NULL REFERENCES departments(id),
      name TEXT NOT NULL,
      qr_code TEXT NOT NULL UNIQUE,
      is_visible INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS room_code_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id INTEGER NOT NULL,
      old_qr_code TEXT NOT NULL,
      rotated_at TEXT NOT NULL DEFAULT (datetime('now')),
      rotated_by TEXT
    );

    CREATE TABLE IF NOT EXISTS templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id INTEGER NOT NULL REFERENCES rooms(id),
      name TEXT NOT NULL,
      shift TEXT NOT NULL DEFAULT 'ca_ngay',
      allow_photo INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_visible INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS template_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      template_id INTEGER NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      department_name TEXT NOT NULL,
      room_name TEXT NOT NULL,
      room_id INTEGER,
      template_id INTEGER,
      template_name TEXT NOT NULL,
      performer_name TEXT NOT NULL,
      server_time TEXT NOT NULL,
      client_time TEXT,
      work_date TEXT NOT NULL,
      shift TEXT NOT NULL,
      items_snapshot TEXT NOT NULL,
      tick_results TEXT NOT NULL,
      note TEXT DEFAULT '',
      photo_path TEXT,
      is_supplement INTEGER NOT NULL DEFAULT 0,
      is_hidden INTEGER NOT NULL DEFAULT 0,
      hide_reason TEXT,
      device_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS name_suggestions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id INTEGER,
      name TEXT NOT NULL,
      last_used TEXT NOT NULL,
      use_count INTEGER NOT NULL DEFAULT 1,
      UNIQUE(room_id, name)
    );

    CREATE TABLE IF NOT EXISTS managers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL DEFAULT '',
      role TEXT NOT NULL DEFAULT 'manager',
      department_ids TEXT NOT NULL DEFAULT '[]',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      at_time TEXT NOT NULL DEFAULT (datetime('now')),
      actor TEXT NOT NULL,
      action TEXT NOT NULL,
      entity TEXT NOT NULL,
      before_data TEXT,
      after_data TEXT
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS reminder_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      at_time TEXT NOT NULL,
      work_date TEXT NOT NULL,
      room_id INTEGER,
      room_name TEXT,
      department_name TEXT,
      channel TEXT,
      message TEXT,
      sent INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_submissions_date ON submissions(work_date);
    CREATE INDEX IF NOT EXISTS idx_submissions_room ON submissions(room_id);
    CREATE INDEX IF NOT EXISTS idx_rooms_qr ON rooms(qr_code);
  `);

  // Cài đặt mặc định
  const defaults = {
    reminder_time: '08:30',
    reminder_emails: '',
    smtp_enabled: '0',
    app_base_url: 'http://localhost:5173',
  };
  const upsert = db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO NOTHING`
  );
  for (const [k, v] of Object.entries(defaults)) upsert.run(k, v);
}

export function getSetting(key, fallback = '') {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : fallback;
}

export function setSetting(key, value) {
  db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(key, String(value));
}

export function writeAudit(actor, action, entity, beforeData, afterData) {
  db.prepare(
    `INSERT INTO audit_log (actor, action, entity, before_data, after_data)
     VALUES (?, ?, ?, ?, ?)`
  ).run(
    actor || 'system',
    action,
    entity,
    beforeData != null ? JSON.stringify(beforeData) : null,
    afterData != null ? JSON.stringify(afterData) : null
  );
}

export { uploadDir, dataDir, reportDir, backupDir, dbPath };
