import { Router } from 'express';
import { nanoid } from 'nanoid';
import { db, writeAudit, getSetting, setSetting } from './db.js';
import {
  requireAuth,
  requireAdmin,
  hashPassword,
  parseIds,
} from './auth.js';
import { makeQrPng, makeQrPdfA5, roomUrl } from './qr.js';

export const adminRouter = Router();
adminRouter.use(requireAuth);

function deptNamesByIds(ids) {
  if (!ids?.length) return [];
  return db
    .prepare(`SELECT id, name FROM departments WHERE id IN (${ids.map(() => '?').join(',')})`)
    .all(...ids);
}

/** ---- Khoa ---- */
adminRouter.get('/departments', (req, res) => {
  let rows = db
    .prepare('SELECT * FROM departments ORDER BY name')
    .all();
  if (req.user.role !== 'admin') {
    const ids = req.user.department_ids || [];
    rows = rows.filter((r) => ids.includes(r.id));
  }
  res.json(rows.map((r) => ({ ...r, is_visible: !!r.is_visible })));
});

adminRouter.post('/departments', requireAdmin, (req, res) => {
  const name = String(req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Thiếu tên khoa.' });
  const r = db.prepare('INSERT INTO departments (name) VALUES (?)').run(name);
  const row = db.prepare('SELECT * FROM departments WHERE id = ?').get(r.lastInsertRowid);
  writeAudit(req.user.email, 'create', 'department', null, row);
  res.status(201).json(row);
});

adminRouter.put('/departments/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const before = db.prepare('SELECT * FROM departments WHERE id = ?').get(id);
  if (!before) return res.status(404).json({ error: 'Không tìm thấy khoa.' });
  const name = String(req.body.name ?? before.name).trim();
  const is_visible =
    req.body.is_visible === undefined ? before.is_visible : req.body.is_visible ? 1 : 0;
  db.prepare('UPDATE departments SET name = ?, is_visible = ? WHERE id = ?').run(
    name,
    is_visible,
    id
  );
  const after = db.prepare('SELECT * FROM departments WHERE id = ?').get(id);
  writeAudit(req.user.email, 'update', 'department', before, after);
  res.json(after);
});

/** ---- Phòng ---- */
adminRouter.get('/rooms', (req, res) => {
  let rows = db
    .prepare(
      `SELECT r.*, d.name AS department_name
       FROM rooms r JOIN departments d ON d.id = r.department_id
       ORDER BY d.name, r.name`
    )
    .all();
  if (req.user.role !== 'admin') {
    const ids = req.user.department_ids || [];
    rows = rows.filter((r) => ids.includes(r.department_id));
  }
  res.json(
    rows.map((r) => ({
      ...r,
      is_visible: !!r.is_visible,
      fill_url: roomUrl(r.qr_code),
    }))
  );
});

adminRouter.post('/rooms', requireAdmin, (req, res) => {
  const name = String(req.body.name || '').trim();
  const department_id = Number(req.body.department_id);
  if (!name || !department_id) return res.status(400).json({ error: 'Thiếu tên hoặc khoa.' });
  const qr = nanoid(16);
  const r = db
    .prepare('INSERT INTO rooms (department_id, name, qr_code) VALUES (?, ?, ?)')
    .run(department_id, name, qr);
  const row = db
    .prepare(
      `SELECT r.*, d.name AS department_name FROM rooms r
       JOIN departments d ON d.id = r.department_id WHERE r.id = ?`
    )
    .get(r.lastInsertRowid);
  writeAudit(req.user.email, 'create', 'room', null, row);
  res.status(201).json({ ...row, fill_url: roomUrl(row.qr_code) });
});

adminRouter.put('/rooms/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const before = db.prepare('SELECT * FROM rooms WHERE id = ?').get(id);
  if (!before) return res.status(404).json({ error: 'Không tìm thấy phòng.' });
  const name = String(req.body.name ?? before.name).trim();
  const department_id = Number(req.body.department_id ?? before.department_id);
  const is_visible =
    req.body.is_visible === undefined ? before.is_visible : req.body.is_visible ? 1 : 0;
  db.prepare(
    'UPDATE rooms SET name = ?, department_id = ?, is_visible = ? WHERE id = ?'
  ).run(name, department_id, is_visible, id);
  const after = db.prepare('SELECT * FROM rooms WHERE id = ?').get(id);
  writeAudit(req.user.email, 'update', 'room', before, after);
  res.json(after);
});

/** Đổi mã phòng — QR cũ vô hiệu */
adminRouter.post('/rooms/:id/rotate-code', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const before = db.prepare('SELECT * FROM rooms WHERE id = ?').get(id);
  if (!before) return res.status(404).json({ error: 'Không tìm thấy phòng.' });
  const newCode = nanoid(16);
  db.prepare(
    'INSERT INTO room_code_history (room_id, old_qr_code, rotated_by) VALUES (?, ?, ?)'
  ).run(id, before.qr_code, req.user.email);
  db.prepare('UPDATE rooms SET qr_code = ? WHERE id = ?').run(newCode, id);
  const after = db.prepare('SELECT * FROM rooms WHERE id = ?').get(id);
  writeAudit(req.user.email, 'rotate_qr', 'room', before, after);
  res.json({ ...after, fill_url: roomUrl(after.qr_code) });
});

adminRouter.get('/rooms/:id/qr.png', async (req, res) => {
  const room = db
    .prepare(
      `SELECT r.*, d.name AS department_name FROM rooms r
       JOIN departments d ON d.id = r.department_id WHERE r.id = ?`
    )
    .get(Number(req.params.id));
  if (!room) return res.status(404).json({ error: 'Không tìm thấy phòng.' });
  if (req.user.role !== 'admin' && !req.user.department_ids.includes(room.department_id)) {
    return res.status(403).json({ error: 'Không có quyền.' });
  }
  const buf = await makeQrPng(room.qr_code);
  res.setHeader('Content-Type', 'image/png');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="qr_${room.id}.png"`
  );
  res.send(buf);
});

adminRouter.get('/rooms/:id/qr.pdf', async (req, res) => {
  const room = db
    .prepare(
      `SELECT r.*, d.name AS department_name FROM rooms r
       JOIN departments d ON d.id = r.department_id WHERE r.id = ?`
    )
    .get(Number(req.params.id));
  if (!room) return res.status(404).json({ error: 'Không tìm thấy phòng.' });
  if (req.user.role !== 'admin' && !req.user.department_ids.includes(room.department_id)) {
    return res.status(403).json({ error: 'Không có quyền.' });
  }
  const buf = await makeQrPdfA5({
    qrCode: room.qr_code,
    departmentName: room.department_name,
    roomName: room.name,
  });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="qr_${room.id}.pdf"`
  );
  res.send(buf);
});

/** ---- Mẫu checklist ---- */
adminRouter.get('/templates', (req, res) => {
  let rows = db
    .prepare(
      `SELECT t.*, r.name AS room_name, r.department_id, d.name AS department_name
       FROM templates t
       JOIN rooms r ON r.id = t.room_id
       JOIN departments d ON d.id = r.department_id
       ORDER BY d.name, r.name, t.sort_order, t.id`
    )
    .all();
  if (req.user.role !== 'admin') {
    const ids = req.user.department_ids || [];
    rows = rows.filter((r) => ids.includes(r.department_id));
  }
  const itemsStmt = db.prepare(
    'SELECT id, content, sort_order FROM template_items WHERE template_id = ? ORDER BY sort_order, id'
  );
  res.json(
    rows.map((t) => ({
      ...t,
      allow_photo: !!t.allow_photo,
      is_visible: !!t.is_visible,
      items: itemsStmt.all(t.id),
    }))
  );
});

adminRouter.post('/templates', requireAdmin, (req, res) => {
  const {
    room_id,
    name,
    shift = 'ca_ngay',
    allow_photo = true,
    items = [],
    sort_order = 0,
  } = req.body;
  if (!room_id || !name) return res.status(400).json({ error: 'Thiếu phòng hoặc tên mẫu.' });
  const itemLines = Array.isArray(items)
    ? items.map((x) => String(x.content || x).trim()).filter(Boolean)
    : String(items)
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
  if (!itemLines.length) return res.status(400).json({ error: 'Cần ít nhất 1 mục.' });

  const tx = db.transaction(() => {
    const r = db
      .prepare(
        `INSERT INTO templates (room_id, name, shift, allow_photo, sort_order)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(Number(room_id), String(name).trim(), shift, allow_photo ? 1 : 0, sort_order);
    const tid = r.lastInsertRowid;
    const ins = db.prepare(
      'INSERT INTO template_items (template_id, content, sort_order) VALUES (?, ?, ?)'
    );
    itemLines.forEach((c, i) => ins.run(tid, c, i));
    return tid;
  });
  const tid = tx();
  const after = db.prepare('SELECT * FROM templates WHERE id = ?').get(tid);
  writeAudit(req.user.email, 'create', 'template', null, { ...after, items: itemLines });
  res.status(201).json(after);
});

adminRouter.put('/templates/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const before = db.prepare('SELECT * FROM templates WHERE id = ?').get(id);
  if (!before) return res.status(404).json({ error: 'Không tìm thấy mẫu.' });
  const beforeItems = db
    .prepare('SELECT content FROM template_items WHERE template_id = ? ORDER BY sort_order')
    .all(id)
    .map((x) => x.content);

  const name = String(req.body.name ?? before.name).trim();
  const shift = req.body.shift ?? before.shift;
  const allow_photo =
    req.body.allow_photo === undefined ? before.allow_photo : req.body.allow_photo ? 1 : 0;
  const is_visible =
    req.body.is_visible === undefined ? before.is_visible : req.body.is_visible ? 1 : 0;
  const room_id = Number(req.body.room_id ?? before.room_id);

  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE templates SET room_id=?, name=?, shift=?, allow_photo=?, is_visible=? WHERE id=?`
    ).run(room_id, name, shift, allow_photo, is_visible, id);

    if (req.body.items !== undefined) {
      const itemLines = Array.isArray(req.body.items)
        ? req.body.items.map((x) => String(x.content || x).trim()).filter(Boolean)
        : String(req.body.items)
            .split('\n')
            .map((s) => s.trim())
            .filter(Boolean);
      db.prepare('DELETE FROM template_items WHERE template_id = ?').run(id);
      const ins = db.prepare(
        'INSERT INTO template_items (template_id, content, sort_order) VALUES (?, ?, ?)'
      );
      itemLines.forEach((c, i) => ins.run(id, c, i));
    }
  });
  tx();
  const after = db.prepare('SELECT * FROM templates WHERE id = ?').get(id);
  const afterItems = db
    .prepare('SELECT content FROM template_items WHERE template_id = ? ORDER BY sort_order')
    .all(id)
    .map((x) => x.content);
  writeAudit(
    req.user.email,
    'update',
    'template',
    { ...before, items: beforeItems },
    { ...after, items: afterItems }
  );
  res.json({ ...after, items: afterItems.map((c, i) => ({ content: c, sort_order: i })) });
});

adminRouter.post('/templates/:id/clone', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const tpl = db.prepare('SELECT * FROM templates WHERE id = ?').get(id);
  if (!tpl) return res.status(404).json({ error: 'Không tìm thấy mẫu.' });
  const items = db
    .prepare('SELECT content, sort_order FROM template_items WHERE template_id = ?')
    .all(id);
  const tx = db.transaction(() => {
    const r = db
      .prepare(
        `INSERT INTO templates (room_id, name, shift, allow_photo, sort_order)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(tpl.room_id, `${tpl.name} (bản sao)`, tpl.shift, tpl.allow_photo, tpl.sort_order);
    const tid = r.lastInsertRowid;
    const ins = db.prepare(
      'INSERT INTO template_items (template_id, content, sort_order) VALUES (?, ?, ?)'
    );
    items.forEach((it) => ins.run(tid, it.content, it.sort_order));
    return tid;
  });
  const tid = tx();
  writeAudit(req.user.email, 'clone', 'template', { id }, { id: tid });
  res.status(201).json({ id: tid });
});

/** Xóa mẫu — xác nhận hai bước: ?confirm=DELETE */
adminRouter.delete('/templates/:id', requireAdmin, (req, res) => {
  if (req.query.confirm !== 'DELETE') {
    return res.status(400).json({
      error: 'Xác nhận hai bước: gửi lại với ?confirm=DELETE',
    });
  }
  const id = Number(req.params.id);
  const before = db.prepare('SELECT * FROM templates WHERE id = ?').get(id);
  if (!before) return res.status(404).json({ error: 'Không tìm thấy mẫu.' });
  db.prepare('DELETE FROM template_items WHERE template_id = ?').run(id);
  db.prepare('DELETE FROM templates WHERE id = ?').run(id);
  writeAudit(req.user.email, 'delete', 'template', before, null);
  res.json({ ok: true });
});

/** ---- Tài khoản quản lý ---- */
adminRouter.get('/managers', requireAdmin, (_req, res) => {
  const rows = db
    .prepare(
      'SELECT id, email, full_name, role, department_ids, is_active, created_at FROM managers ORDER BY id'
    )
    .all()
    .map((m) => ({
      ...m,
      department_ids: parseIds(m.department_ids),
      is_active: !!m.is_active,
      departments: deptNamesByIds(parseIds(m.department_ids)),
    }));
  res.json(rows);
});

adminRouter.post('/managers', requireAdmin, (req, res) => {
  const email = String(req.body.email || '')
    .trim()
    .toLowerCase();
  const password = String(req.body.password || '');
  const full_name = String(req.body.full_name || '').trim();
  const role = req.body.role === 'admin' ? 'admin' : 'manager';
  const department_ids = Array.isArray(req.body.department_ids)
    ? req.body.department_ids.map(Number)
    : [];
  if (!email || password.length < 6) {
    return res.status(400).json({ error: 'Email và mật khẩu (≥6 ký tự) bắt buộc.' });
  }
  try {
    const r = db
      .prepare(
        `INSERT INTO managers (email, password_hash, full_name, role, department_ids)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(email, hashPassword(password), full_name, role, JSON.stringify(department_ids));
    writeAudit(req.user.email, 'create', 'manager', null, { id: r.lastInsertRowid, email, role });
    res.status(201).json({ id: r.lastInsertRowid, email, role });
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) {
      return res.status(400).json({ error: 'Email đã tồn tại.' });
    }
    throw e;
  }
});

adminRouter.put('/managers/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const before = db.prepare('SELECT * FROM managers WHERE id = ?').get(id);
  if (!before) return res.status(404).json({ error: 'Không tìm thấy tài khoản.' });
  const full_name = String(req.body.full_name ?? before.full_name).trim();
  const role = req.body.role === 'admin' ? 'admin' : req.body.role === 'manager' ? 'manager' : before.role;
  const is_active =
    req.body.is_active === undefined ? before.is_active : req.body.is_active ? 1 : 0;
  const department_ids =
    req.body.department_ids !== undefined
      ? JSON.stringify(req.body.department_ids.map(Number))
      : before.department_ids;
  db.prepare(
    `UPDATE managers SET full_name=?, role=?, is_active=?, department_ids=? WHERE id=?`
  ).run(full_name, role, is_active, department_ids, id);
  if (req.body.password && String(req.body.password).length >= 6) {
    db.prepare('UPDATE managers SET password_hash=? WHERE id=?').run(
      hashPassword(req.body.password),
      id
    );
  }
  const after = db
    .prepare(
      'SELECT id, email, full_name, role, department_ids, is_active FROM managers WHERE id = ?'
    )
    .get(id);
  writeAudit(req.user.email, 'update', 'manager', { id, email: before.email }, after);
  res.json(after);
});

/** ---- Audit & settings ---- */
adminRouter.get('/audit-log', requireAdmin, (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const rows = db
    .prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT ?')
    .all(limit);
  res.json(rows);
});

adminRouter.get('/settings', requireAdmin, (_req, res) => {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const obj = {};
  rows.forEach((r) => {
    obj[r.key] = r.value;
  });
  res.json(obj);
});

adminRouter.put('/settings', requireAdmin, (req, res) => {
  const allowed = ['reminder_time', 'reminder_emails', 'smtp_enabled', 'app_base_url'];
  for (const key of allowed) {
    if (req.body[key] !== undefined) setSetting(key, req.body[key]);
  }
  writeAudit(req.user.email, 'update', 'settings', null, req.body);
  res.json({ ok: true });
});

/** Ẩn bản ghi nghi ngờ (không xóa) */
adminRouter.post('/submissions/:id/hide', (req, res) => {
  const id = Number(req.params.id);
  const reason = String(req.body.reason || '').trim();
  if (!reason) return res.status(400).json({ error: 'Cần lý do ẩn.' });
  const row = db.prepare('SELECT * FROM submissions WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: 'Không tìm thấy.' });
  if (req.user.role !== 'admin') {
    const ids = req.user.department_ids || [];
    if (!ids.length) return res.status(403).json({ error: 'Không có quyền.' });
    const names = db
      .prepare(`SELECT name FROM departments WHERE id IN (${ids.map(() => '?').join(',')})`)
      .all(...ids);
    if (!names.some((n) => n.name === row.department_name)) {
      return res.status(403).json({ error: 'Không có quyền.' });
    }
  }
  db.prepare('UPDATE submissions SET is_hidden = 1, hide_reason = ? WHERE id = ?').run(
    reason,
    id
  );
  writeAudit(req.user.email, 'hide', 'submission', { id }, { reason });
  res.json({ ok: true });
});
