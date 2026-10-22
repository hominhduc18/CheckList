import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import { nanoid } from 'nanoid';

const isVercel = Boolean(process.env.VERCEL || process.env.NOW_REGION);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sourceDataDir = path.join(__dirname, '..', 'data');
const dataDir = isVercel ? '/tmp/checklist-data' : sourceDataDir;
const uploadDir = path.join(dataDir, 'uploads');
const reportDir = path.join(dataDir, 'reports');
const backupDir = path.join(dataDir, 'backups');

for (const dir of [dataDir, uploadDir, reportDir, backupDir]) {
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch {
      /* ignore */
    }
  }
}

const dbPath = path.join(dataDir, 'checklist.db');

// Nếu chạy trên Vercel, sao chép checklist.db ban đầu sang /tmp (nếu có)
if (isVercel && !fs.existsSync(dbPath)) {
  const sourceDb = path.join(sourceDataDir, 'checklist.db');
  if (fs.existsSync(sourceDb)) {
    try {
      fs.copyFileSync(sourceDb, dbPath);
    } catch {
      /* ignore */
    }
  }
}

export const db = new Database(dbPath);

if (isVercel) {
  try {
    db.pragma('journal_mode = MEMORY');
  } catch {
    /* ignore */
  }
} else {
  try {
    db.pragma('journal_mode = WAL');
  } catch {
    /* ignore */
  }
}
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

  // Tự động seed tài khoản admin và khoa phòng nếu database mới (như trên Vercel /tmp)
  try {
    const adminExists = db.prepare(`SELECT id FROM managers WHERE role = 'admin' LIMIT 1`).get();
    if (!adminExists) {
      db.prepare(
        `INSERT INTO managers (email, password_hash, full_name, role, department_ids)
         VALUES (?, ?, ?, 'admin', '[]')`
      ).run('admin@bv.local', bcrypt.hashSync('Admin@123', 10), 'Quản trị hệ thống');
    }

    const deptCount = db.prepare('SELECT COUNT(*) AS c FROM departments').get().c;
    if (deptCount === 0) {
      const deptId = db.prepare('INSERT INTO departments (name) VALUES (?)').run('Khoa Khám bệnh').lastInsertRowid;
      const qrCode = nanoid(16);
      db.prepare('INSERT INTO rooms (department_id, name, qr_code) VALUES (?, ?, ?)').run(deptId, 'Khoa Khám bệnh', qrCode);

      db.prepare(
        `INSERT INTO managers (email, password_hash, full_name, role, department_ids)
         VALUES (?, ?, ?, 'manager', ?)`
      ).run('khoa.kham@bv.local', bcrypt.hashSync('Manager@123', 10), 'Quản lý Khoa Khám', JSON.stringify([deptId]));
    }
  } catch (e) {
    console.warn('auto-seed note:', e.message);
  }

  // Đảm bảo các phòng có nhiều mẫu form đa dạng để người dùng lựa chọn
  try {
    const roomsList = db.prepare(`SELECT id, name FROM rooms WHERE is_visible = 1`).all();
    for (const r of roomsList) {
      const tplCount = db.prepare(`SELECT COUNT(*) AS c FROM templates WHERE room_id = ? AND is_visible = 1`).get(r.id).c;
      if (tplCount <= 1) {
        // Đổi tên mẫu đầu tiên (nếu là 'Checklist hằng ngày')
        const firstTpl = db.prepare(`SELECT id, name FROM templates WHERE room_id = ? LIMIT 1`).get(r.id);
        if (firstTpl && firstTpl.name === 'Checklist hằng ngày') {
          db.prepare(`UPDATE templates SET name = 'Bảng kiểm Vệ sinh & Buồng phòng' WHERE id = ?`).run(firstTpl.id);
        }

        const insertTpl = db.prepare(
          `INSERT INTO templates (room_id, name, shift, allow_photo, sort_order) VALUES (?, ?, 'ca_ngay', 1, ?)`
        );
        const insertItem = db.prepare(
          `INSERT INTO template_items (template_id, content, sort_order) VALUES (?, ?, ?)`
        );

        // Mẫu 2: Trang thiết bị & Máy móc
        const tpl2 = insertTpl.run(r.id, 'Bảng kiểm Trang thiết bị & Máy móc', 1).lastInsertRowid;
        const items2 = [
          'Kiểm tra hoạt động máy móc, dây cắm, thiết bị y tế',
          'Kiểm tra máy tính, kết nối mạng nội bộ và máy in phiếu',
          'Kiểm tra nguồn điện dự phòng (UPS) và dây nối an toàn',
          'Kiểm tra nhiệt độ phòng và máy điều hòa hoạt động tốt',
        ];
        items2.forEach((content, i) => insertItem.run(tpl2, content, i));

        // Mẫu 3: Vật tư y tế & Hộp cấp cứu
        const tpl3 = insertTpl.run(r.id, 'Bảng kiểm Vật tư y tế & Hộp cấp cứu', 2).lastInsertRowid;
        const items3 = [
          'Kiểm tra cơ số bông, cồn sát khuẩn, gạc, dây garo',
          'Kiểm tra kim tiêm, ống nghiệm chân không còn hạn sử dụng',
          'Kiểm tra hộp chống sốc phản vệ đầy đủ thuốc và hạn dùng',
          'Kiểm tra thùng rác y tế đúng màu phân loại (vàng, đen, trắng)',
        ];
        items3.forEach((content, i) => insertItem.run(tpl3, content, i));
      }
    }

    // Đổi tên phòng 'Lấy máu, điện tim' hoặc 'Phòng khám 01' thành 'Khoa Khám bệnh'
    db.prepare(`UPDATE rooms SET name = 'Khoa Khám bệnh' WHERE name IN ('Lấy máu, điện tim', 'Phòng khám 01')`).run();
    db.prepare(`UPDATE template_items SET content = replace(content, 'bàn lấy máu, ', 'bàn khám, ') WHERE content LIKE '%bàn lấy máu%'`).run();
    db.prepare(`UPDATE template_items SET content = replace(content, 'xe điện tim, ', '') WHERE content LIKE '%xe điện tim%'`).run();
    db.prepare(`UPDATE template_items SET content = replace(content, 'lấy máu', 'khám / thủ thuật') WHERE content LIKE '%lấy máu%'`).run();
    db.prepare(`UPDATE template_items SET content = replace(content, 'máy đo điện tim', 'máy móc thiết bị') WHERE content LIKE '%máy đo điện tim%'`).run();
  } catch (e) {
    console.warn('ensure multi templates note:', e.message);
  }
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
