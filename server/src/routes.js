import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { nanoid } from 'nanoid';
import { db, uploadDir } from './db.js';
import {
  nowVN,
  detectShift,
  rangeToday,
  rangeLast7Days,
  rangeThisMonth,
  formatDateVN,
  formatTimeVN,
} from './time.js';
import { buildChecklistWorkbook, exportFileName } from './excel.js';
import { requireAuth, allowedDepartmentNames } from './auth.js';

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase() || '.jpg';
      cb(null, `${Date.now()}_${nanoid(8)}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype?.startsWith('image/')) {
      return cb(new Error('Chỉ chấp nhận ảnh'));
    }
    cb(null, true);
  },
});

export const router = Router();

function parseJson(v, fallback) {
  try {
    return typeof v === 'string' ? JSON.parse(v) : v ?? fallback;
  } catch {
    return fallback;
  }
}

function enrichSubmission(s) {
  const items = parseJson(s.items_snapshot, []);
  const ticks = parseJson(s.tick_results, {});
  const total = items.length;
  const done = items.filter((it) => ticks[String(it.id)] === true).length;
  const missing = items.filter((it) => ticks[String(it.id)] !== true);
  return {
    ...s,
    items,
    ticks,
    done_count: done,
    total_count: total,
    is_complete: total > 0 && done === total,
    missing_items: missing.map((m) => m.content),
    date_display: formatDateVN(s.work_date),
    time_display: formatTimeVN(s.server_time),
  };
}

/** GET /api/health */
router.get('/health', (_req, res) => {
  const t = nowVN();
  res.json({ ok: true, server_time: t.isoLocal, timezone: 'Asia/Ho_Chi_Minh' });
});

/** GET /api/rooms/:qrCode — thông tin phòng + mẫu checklist */
router.get('/rooms/:qrCode', (req, res) => {
  const room = db
    .prepare(
      `SELECT r.*, d.name AS department_name
       FROM rooms r
       JOIN departments d ON d.id = r.department_id
       WHERE r.qr_code = ? AND r.is_visible = 1 AND d.is_visible = 1`
    )
    .get(req.params.qrCode);

  if (!room) {
    return res.status(404).json({ error: 'Không tìm thấy phòng hoặc mã QR đã hết hiệu lực.' });
  }

  const templates = db
    .prepare(
      `SELECT id, name, shift, allow_photo, sort_order
       FROM templates
       WHERE room_id = ? AND is_visible = 1
       ORDER BY sort_order, id`
    )
    .all(room.id);

  const getItems = db.prepare(
    `SELECT id, content, sort_order FROM template_items
     WHERE template_id = ? ORDER BY sort_order, id`
  );

  const templatesWithItems = templates.map((t) => ({
    ...t,
    allow_photo: !!t.allow_photo,
    items: getItems.all(t.id),
  }));

  const server = nowVN();
  res.json({
    room: {
      id: room.id,
      name: room.name,
      qr_code: room.qr_code,
      department_id: room.department_id,
      department_name: room.department_name,
    },
    templates: templatesWithItems,
    server_time: server.isoLocal,
    work_date: server.date,
    shift: detectShift(server.hour),
  });
});

/** GET /api/rooms/:qrCode/names — gợi ý tên đã dùng */
router.get('/rooms/:roomId/name-suggestions', (req, res) => {
  const roomId = Number(req.params.roomId);
  const q = (req.query.q || '').toString().trim();
  let rows;
  if (q) {
    rows = db
      .prepare(
        `SELECT name, use_count FROM name_suggestions
         WHERE room_id = ? AND name LIKE ?
         ORDER BY use_count DESC, last_used DESC LIMIT 8`
      )
      .all(roomId, `%${q}%`);
  } else {
    rows = db
      .prepare(
        `SELECT name, use_count FROM name_suggestions
         WHERE room_id = ?
         ORDER BY last_used DESC LIMIT 8`
      )
      .all(roomId);
  }
  res.json(rows.map((r) => r.name));
});

/** Kiểm tra đã có bản gửi cùng mẫu + ca + ngày chưa */
router.get('/submissions/check-duplicate', (req, res) => {
  const { template_id, work_date, shift } = req.query;
  if (!template_id || !work_date || !shift) {
    return res.status(400).json({ error: 'Thiếu tham số' });
  }
  const row = db
    .prepare(
      `SELECT id, performer_name, server_time FROM submissions
       WHERE template_id = ? AND work_date = ? AND shift = ?
         AND is_hidden = 0
       ORDER BY server_time DESC LIMIT 1`
    )
    .get(Number(template_id), work_date, shift);
  res.json({
    exists: !!row,
    last: row
      ? {
          id: row.id,
          performer_name: row.performer_name,
          time_display: formatTimeVN(row.server_time),
        }
      : null,
  });
});

/** POST /api/submissions — gửi checklist (nhân viên, không đăng nhập) */
router.post('/submissions', upload.single('photo'), (req, res) => {
  try {
    const body = req.body;
    const roomId = Number(body.room_id);
    const templateId = Number(body.template_id);
    const performer = String(body.performer_name || '').trim();
    const note = String(body.note || '').trim();
    const deviceId = String(body.device_id || '').slice(0, 64);
    const clientTime = body.client_time || null;
    const isSupplement = body.is_supplement === '1' || body.is_supplement === 'true' || body.is_supplement === true;

    if (!performer || performer.length < 2) {
      return res.status(400).json({ error: 'Vui lòng nhập tên người thực hiện (ít nhất 2 ký tự).' });
    }
    if (performer.length > 80) {
      return res.status(400).json({ error: 'Tên quá dài.' });
    }

    // Chống gửi quá nhanh theo thiết bị (tối thiểu 8 giây)
    if (deviceId) {
      const recent = db
        .prepare(
          `SELECT created_at FROM submissions
           WHERE device_id = ?
           ORDER BY id DESC LIMIT 1`
        )
        .get(deviceId);
      if (recent) {
        const last = new Date(recent.created_at + 'Z').getTime();
        if (Date.now() - last < 8000) {
          return res.status(429).json({
            error: 'Gửi quá nhanh. Vui lòng đợi vài giây rồi thử lại.',
          });
        }
      }
    }

    const room = db
      .prepare(
        `SELECT r.*, d.name AS department_name
         FROM rooms r JOIN departments d ON d.id = r.department_id
         WHERE r.id = ? AND r.is_visible = 1`
      )
      .get(roomId);
    if (!room) return res.status(404).json({ error: 'Phòng không hợp lệ.' });

    const tpl = db
      .prepare(
        `SELECT * FROM templates WHERE id = ? AND room_id = ? AND is_visible = 1`
      )
      .get(templateId, roomId);
    if (!tpl) return res.status(404).json({ error: 'Mẫu checklist không hợp lệ.' });

    const items = db
      .prepare(
        `SELECT id, content, sort_order FROM template_items
         WHERE template_id = ? ORDER BY sort_order, id`
      )
      .all(templateId);

    let ticks = {};
    try {
      ticks = JSON.parse(body.tick_results || '{}');
    } catch {
      return res.status(400).json({ error: 'Dữ liệu tick không hợp lệ.' });
    }

    // Chỉ nhận key thuộc mẫu hiện tại, giá trị boolean
    const cleanTicks = {};
    for (const it of items) {
      cleanTicks[String(it.id)] = ticks[String(it.id)] === true;
    }

    const missing = items.filter((it) => !cleanTicks[String(it.id)]);
    if (missing.length > 0 && !note) {
      return res.status(400).json({
        error: 'Còn mục chưa tick — vui lòng ghi lý do vào ô Ghi chú.',
        missing: missing.map((m) => m.content),
      });
    }

    if (tpl.allow_photo && req.file && req.file.size > 5 * 1024 * 1024) {
      return res.status(400).json({ error: 'Ảnh vượt quá 5 MB.' });
    }

    const server = nowVN();
    // Ca theo mẫu: nếu mẫu là ca_ngay thì dùng ca theo giờ server
    let shift = detectShift(server.hour);
    if (tpl.shift === 'sang' || tpl.shift === 'chieu') {
      shift = tpl.shift;
    }

    const itemsSnapshot = items.map((it) => ({
      id: it.id,
      content: it.content,
      sort_order: it.sort_order,
    }));

    const photoPath = req.file ? `uploads/${req.file.filename}` : null;

    const result = db
      .prepare(
        `INSERT INTO submissions (
          department_name, room_name, room_id, template_id, template_name,
          performer_name, server_time, client_time, work_date, shift,
          items_snapshot, tick_results, note, photo_path,
          is_supplement, device_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        room.department_name,
        room.name,
        room.id,
        tpl.id,
        tpl.name,
        performer,
        server.isoLocal,
        clientTime,
        server.date,
        shift,
        JSON.stringify(itemsSnapshot),
        JSON.stringify(cleanTicks),
        note,
        photoPath,
        isSupplement ? 1 : 0,
        deviceId || null
      );

    // Cập nhật gợi ý tên
    db.prepare(
      `INSERT INTO name_suggestions (room_id, name, last_used, use_count)
       VALUES (?, ?, ?, 1)
       ON CONFLICT(room_id, name) DO UPDATE SET
         last_used = excluded.last_used,
         use_count = use_count + 1`
    ).run(room.id, performer, server.isoLocal);

    const done = items.length - missing.length;
    res.status(201).json({
      id: result.lastInsertRowid,
      server_time: server.isoLocal,
      time_display: formatTimeVN(server.isoLocal),
      date_display: formatDateVN(server.date),
      performer_name: performer,
      is_supplement: !!isSupplement,
      done_count: done,
      total_count: items.length,
      is_complete: missing.length === 0,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Lỗi máy chủ' });
  }
});

/** Bộ lọc submissions dùng chung */
function querySubmissions(filters) {
  const where = ['s.is_hidden = 0'];
  const params = [];

  if (filters.from) {
    where.push('s.work_date >= ?');
    params.push(filters.from);
  }
  if (filters.to) {
    where.push('s.work_date <= ?');
    params.push(filters.to);
  }
  if (filters.department) {
    where.push('s.department_name = ?');
    params.push(filters.department);
  }
  if (filters.room_id) {
    where.push('s.room_id = ?');
    params.push(Number(filters.room_id));
  }
  if (filters.template_id) {
    where.push('s.template_id = ?');
    params.push(Number(filters.template_id));
  }
  if (filters.q) {
    where.push('(s.performer_name LIKE ? OR s.note LIKE ?)');
    params.push(`%${filters.q}%`, `%${filters.q}%`);
  }
  if (filters.allowedDepartments !== null && filters.allowedDepartments !== undefined) {
    if (!filters.allowedDepartments.length) {
      where.push('0=1');
    } else {
      where.push(
        `s.department_name IN (${filters.allowedDepartments.map(() => '?').join(',')})`
      );
      params.push(...filters.allowedDepartments);
    }
  }

  let rows = db
    .prepare(
      `SELECT s.* FROM submissions s
       WHERE ${where.join(' AND ')}
       ORDER BY s.server_time DESC`
    )
    .all(...params)
    .map(enrichSubmission);

  if (filters.status === 'du') {
    rows = rows.filter((r) => r.is_complete);
  } else if (filters.status === 'thieu') {
    rows = rows.filter((r) => !r.is_complete);
  }

  return rows;
}

/** GET /api/meta/filters — danh sách khoa/phòng/mẫu để lọc */
router.get('/meta/filters', requireAuth, (req, res) => {
  const allowed = allowedDepartmentNames(req.user);
  let departments = db
    .prepare(
      `SELECT DISTINCT name FROM departments WHERE is_visible = 1 ORDER BY name`
    )
    .all()
    .map((d) => d.name);
  if (allowed !== null) departments = departments.filter((n) => allowed.includes(n));

  let rooms = db
    .prepare(
      `SELECT r.id, r.name, d.name AS department_name
       FROM rooms r JOIN departments d ON d.id = r.department_id
       WHERE r.is_visible = 1 ORDER BY d.name, r.name`
    )
    .all();
  if (allowed !== null) rooms = rooms.filter((r) => allowed.includes(r.department_name));

  let templates = db
    .prepare(
      `SELECT t.id, t.name, t.room_id, r.name AS room_name, d.name AS department_name
       FROM templates t
       JOIN rooms r ON r.id = t.room_id
       JOIN departments d ON d.id = r.department_id
       WHERE t.is_visible = 1 ORDER BY t.name`
    )
    .all();
  if (allowed !== null) {
    templates = templates.filter((t) => allowed.includes(t.department_name));
  }

  res.json({ departments, rooms, templates });
});

/** GET /api/submissions — lịch sử (cần đăng nhập) */
router.get('/submissions', requireAuth, (req, res) => {
  const filters = {
    from: req.query.from,
    to: req.query.to,
    department: req.query.department,
    room_id: req.query.room_id,
    template_id: req.query.template_id,
    status: req.query.status,
    q: req.query.q,
    allowedDepartments: allowedDepartmentNames(req.user),
  };
  const rows = querySubmissions(filters);
  res.json({
    count: rows.length,
    items: rows.map((r) => ({
      id: r.id,
      department_name: r.department_name,
      room_name: r.room_name,
      template_name: r.template_name,
      performer_name: r.performer_name,
      server_time: r.server_time,
      work_date: r.work_date,
      shift: r.shift,
      note: r.note,
      photo_path: r.photo_path,
      is_supplement: !!r.is_supplement,
      done_count: r.done_count,
      total_count: r.total_count,
      is_complete: r.is_complete,
      missing_items: r.missing_items,
      date_display: r.date_display,
      time_display: r.time_display,
    })),
  });
});

/** GET /api/export/excel — xuất .xlsx theo bộ lọc */
router.get('/export/excel', requireAuth, async (req, res) => {
  try {
    let from = req.query.from;
    let to = req.query.to;
    const preset = req.query.preset;

    if (preset === 'today') {
      ({ from, to } = rangeToday());
    } else if (preset === '7d') {
      ({ from, to } = rangeLast7Days());
    } else if (preset === 'month') {
      ({ from, to } = rangeThisMonth());
    }

    if (!from || !to) {
      return res.status(400).json({ error: 'Cần from/to hoặc preset (today|7d|month).' });
    }

    const filters = {
      from,
      to,
      department: req.query.department,
      room_id: req.query.room_id,
      template_id: req.query.template_id,
      status: req.query.status,
      q: req.query.q,
      allowedDepartments: allowedDepartmentNames(req.user),
    };

    const rows = querySubmissions(filters);
    // Xuất theo thời gian tăng dần
    rows.sort((a, b) => String(a.server_time).localeCompare(String(b.server_time)));

    const wb = await buildChecklistWorkbook(rows);
    const filename = exportFileName(from, to);

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`
    );

    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Lỗi xuất Excel' });
  }
});

/** GET /api/rooms-list — danh sách phòng + mã QR (tạm cho giai đoạn 1) */
router.get('/rooms-list', (_req, res) => {
  const rows = db
    .prepare(
      `SELECT r.id, r.name, r.qr_code, d.name AS department_name
       FROM rooms r JOIN departments d ON d.id = r.department_id
       WHERE r.is_visible = 1`
    )
    .all();
  res.json(rows);
});
