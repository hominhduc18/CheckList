import { Router } from 'express';
import { db } from './db.js';
import { requireAuth, optionalAuth, allowedDepartmentNames } from './auth.js';
import { nowVN, formatDateVN } from './time.js';
import { buildSubmissionPdf, buildRoomMonthPdf } from './pdf.js';
import fs from 'fs';
import path from 'path';
import { backupDir, dbPath } from './db.js';

export const statsRouter = Router();
statsRouter.use(optionalAuth);

function parseJson(v, fallback) {
  try {
    return typeof v === 'string' ? JSON.parse(v) : v ?? fallback;
  } catch {
    return fallback;
  }
}

function scopeFilter(user, alias = 's') {
  const allowed = allowedDepartmentNames(user);
  if (allowed === null) return { sql: '1=1', params: [] };
  if (!allowed.length) return { sql: '0=1', params: [] };
  return {
    sql: `${alias}.department_name IN (${allowed.map(() => '?').join(',')})`,
    params: allowed,
  };
}

function enrich(s) {
  const items = parseJson(s.items_snapshot, []);
  const ticks = parseJson(s.tick_results, {});
  const total = items.length;
  const done = items.filter((it) => ticks[String(it.id)] === true).length;
  return {
    ...s,
    items,
    ticks,
    done_count: done,
    total_count: total,
    is_complete: total > 0 && done === total,
  };
}

/** Thống kê tổng hợp */
statsRouter.get('/overview', (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) return res.status(400).json({ error: 'Cần from, to' });
  const scope = scopeFilter(req.user);
  const rows = db
    .prepare(
      `SELECT * FROM submissions s
       WHERE s.is_hidden = 0 AND s.work_date >= ? AND s.work_date <= ?
         AND ${scope.sql}
       ORDER BY s.server_time`
    )
    .all(from, to, ...scope.params)
    .map(enrich);

  const byDay = {};
  const byDept = {};
  const byRoom = {};
  const byPerson = {};
  const missCount = {};

  for (const r of rows) {
    byDay[r.work_date] = byDay[r.work_date] || { total: 0, complete: 0 };
    byDay[r.work_date].total += 1;
    if (r.is_complete) byDay[r.work_date].complete += 1;

    byDept[r.department_name] = byDept[r.department_name] || { total: 0, complete: 0 };
    byDept[r.department_name].total += 1;
    if (r.is_complete) byDept[r.department_name].complete += 1;

    const rk = `${r.department_name} / ${r.room_name}`;
    byRoom[rk] = byRoom[rk] || { total: 0, complete: 0 };
    byRoom[rk].total += 1;
    if (r.is_complete) byRoom[rk].complete += 1;

    byPerson[r.performer_name] = byPerson[r.performer_name] || { total: 0, complete: 0 };
    byPerson[r.performer_name].total += 1;
    if (r.is_complete) byPerson[r.performer_name].complete += 1;

    for (const it of r.items) {
      if (r.ticks[String(it.id)] !== true) {
        missCount[it.content] = (missCount[it.content] || 0) + 1;
      }
    }
  }

  const missedMost = Object.entries(missCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([content, count]) => ({ content, count }));

  res.json({
    total_submissions: rows.length,
    complete: rows.filter((r) => r.is_complete).length,
    by_day: Object.entries(byDay).map(([date, v]) => ({
      date,
      date_display: formatDateVN(date),
      ...v,
      rate: v.total ? Math.round((v.complete / v.total) * 100) : 0,
    })),
    by_department: Object.entries(byDept).map(([name, v]) => ({
      name,
      ...v,
      rate: v.total ? Math.round((v.complete / v.total) * 100) : 0,
    })),
    by_room: Object.entries(byRoom).map(([name, v]) => ({
      name,
      ...v,
      rate: v.total ? Math.round((v.complete / v.total) * 100) : 0,
    })),
    by_person: Object.entries(byPerson)
      .map(([name, v]) => ({
        name,
        ...v,
        rate: v.total ? Math.round((v.complete / v.total) * 100) : 0,
      }))
      .sort((a, b) => b.total - a.total),
    missed_most: missedMost,
  });
});

/** Lịch tháng theo phòng: xanh đủ / đỏ thiếu / xám chưa điền */
statsRouter.get('/calendar', (req, res) => {
  const yearMonth = String(req.query.month || nowVN().date.slice(0, 7)); // yyyy-mm
  const roomId = Number(req.query.room_id);
  if (!roomId) return res.status(400).json({ error: 'Cần room_id' });

  const room = db
    .prepare(
      `SELECT r.*, d.name AS department_name FROM rooms r
       JOIN departments d ON d.id = r.department_id WHERE r.id = ?`
    )
    .get(roomId);
  if (!room) return res.status(404).json({ error: 'Không tìm thấy phòng.' });

  const allowed = allowedDepartmentNames(req.user);
  if (allowed !== null && !allowed.includes(room.department_name)) {
    return res.status(403).json({ error: 'Không có quyền.' });
  }

  const [y, m] = yearMonth.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const today = nowVN().date;

  const subs = db
    .prepare(
      `SELECT * FROM submissions
       WHERE room_id = ? AND is_hidden = 0 AND work_date LIKE ?
       ORDER BY server_time`
    )
    .all(roomId, `${yearMonth}%`)
    .map(enrich);

  const byDate = {};
  for (const s of subs) {
    if (!byDate[s.work_date]) byDate[s.work_date] = [];
    byDate[s.work_date].push(s);
  }

  const days = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const date = `${yearMonth}-${String(d).padStart(2, '0')}`;
    if (date > today) {
      days.push({ date, status: 'future', label: 'Chưa tới' });
      continue;
    }
    const list = byDate[date] || [];
    if (!list.length) {
      days.push({ date, status: 'empty', label: 'Chưa điền' });
    } else if (list.every((x) => x.is_complete)) {
      days.push({ date, status: 'ok', label: 'Đủ', count: list.length });
    } else {
      days.push({ date, status: 'missing', label: 'Thiếu', count: list.length });
    }
  }

  const emptyDays = days.filter((d) => d.status === 'empty').length;
  res.json({
    room: { id: room.id, name: room.name, department_name: room.department_name },
    month: yearMonth,
    empty_days: emptyDays,
    days,
  });
});

/** PDF một bản ghi */
statsRouter.get('/submissions/:id/pdf', async (req, res) => {
  const row = db.prepare('SELECT * FROM submissions WHERE id = ?').get(Number(req.params.id));
  if (!row || row.is_hidden) return res.status(404).json({ error: 'Không tìm thấy.' });
  const allowed = allowedDepartmentNames(req.user);
  if (allowed !== null && !allowed.includes(row.department_name)) {
    return res.status(403).json({ error: 'Không có quyền.' });
  }
  const buf = await buildSubmissionPdf(row);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="checklist_${row.id}.pdf"`
  );
  res.send(buf);
});

/** PDF tháng theo phòng */
statsRouter.get('/rooms/:id/month-pdf', async (req, res) => {
  const roomId = Number(req.params.id);
  const yearMonth = String(req.query.month || nowVN().date.slice(0, 7));
  const room = db
    .prepare(
      `SELECT r.*, d.name AS department_name FROM rooms r
       JOIN departments d ON d.id = r.department_id WHERE r.id = ?`
    )
    .get(roomId);
  if (!room) return res.status(404).json({ error: 'Không tìm thấy phòng.' });

  const allowed = allowedDepartmentNames(req.user);
  if (allowed !== null && !allowed.includes(room.department_name)) {
    return res.status(403).json({ error: 'Không có quyền.' });
  }

  const subs = db
    .prepare(
      `SELECT * FROM submissions
       WHERE room_id = ? AND is_hidden = 0 AND work_date LIKE ?
       ORDER BY server_time`
    )
    .all(roomId, `${yearMonth}%`);

  const headerMap = new Map();
  for (const s of subs) {
    for (const it of parseJson(s.items_snapshot, [])) {
      if (!headerMap.has(String(it.id))) headerMap.set(String(it.id), it.content);
    }
  }
  const itemHeaders = [...headerMap.values()];
  const ids = [...headerMap.keys()];

  const dayRows = subs.map((s) => {
    const ticks = parseJson(s.tick_results, {});
    const itemIds = new Set(parseJson(s.items_snapshot, []).map((i) => String(i.id)));
    return {
      date: s.work_date,
      time: s.server_time?.split('T')[1]?.slice(0, 5) || '',
      marks: ids.map((id) => {
        if (!itemIds.has(id)) return '';
        return ticks[id] === true ? '✓' : '✗';
      }),
      signer: s.performer_name,
    };
  });

  const buf = await buildRoomMonthPdf({
    departmentName: room.department_name,
    roomName: room.name,
    yearMonth,
    itemHeaders,
    dayRows,
  });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="checklist_${roomId}_${yearMonth}.pdf"`
  );
  res.send(buf);
});

/** CSV UTF-8 BOM */
statsRouter.get('/export/csv', (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) return res.status(400).json({ error: 'Cần from, to' });
  const scope = scopeFilter(req.user);
  const rows = db
    .prepare(
      `SELECT * FROM submissions s
       WHERE s.is_hidden = 0 AND s.work_date >= ? AND s.work_date <= ?
         AND ${scope.sql}
       ORDER BY s.server_time`
    )
    .all(from, to, ...scope.params)
    .map(enrich);

  const lines = [
    'Thời gian,Khoa,Phòng,Mẫu,Người thực hiện,Đã làm,Chưa làm,Ghi chú',
  ];
  for (const r of rows) {
    const done = r.items.filter((it) => r.ticks[String(it.id)] === true).map((i) => i.content);
    const miss = r.items.filter((it) => r.ticks[String(it.id)] !== true).map((i) => i.content);
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    lines.push(
      [
        `${formatDateVN(r.work_date)} ${r.server_time?.split('T')[1]?.slice(0, 5) || ''}`,
        r.department_name,
        r.room_name,
        r.template_name,
        r.performer_name,
        done.join('; '),
        miss.join('; '),
        r.note || '',
      ]
        .map(esc)
        .join(',')
    );
  }
  const bom = '\uFEFF';
  const filename = `checklist_${from}_den_${to}.csv`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`
  );
  res.send(bom + lines.join('\n'));
});

/** Sao lưu: copy DB + JSON dump */
statsRouter.post('/backup', (req, res) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Chỉ admin.' });
  }
  const stamp = nowVN().isoLocal.replace(/[:T]/g, '-');
  const destDb = path.join(backupDir, `checklist_${stamp}.db`);
  fs.copyFileSync(dbPath, destDb);

  const dump = {
    exported_at: nowVN().isoLocal,
    departments: db.prepare('SELECT * FROM departments').all(),
    rooms: db.prepare('SELECT * FROM rooms').all(),
    templates: db.prepare('SELECT * FROM templates').all(),
    template_items: db.prepare('SELECT * FROM template_items').all(),
    submissions: db.prepare('SELECT * FROM submissions').all(),
    managers: db
      .prepare('SELECT id, email, full_name, role, department_ids, is_active, created_at FROM managers')
      .all(),
  };
  const destJson = path.join(backupDir, `dump_${stamp}.json`);
  fs.writeFileSync(destJson, JSON.stringify(dump, null, 2), 'utf8');
  res.json({ ok: true, db: destDb, json: destJson });
});

/** Xuất toàn bộ dữ liệu JSON tải về */
statsRouter.get('/export/full-json', (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Chỉ admin.' });
  }
  const dump = {
    exported_at: nowVN().isoLocal,
    departments: db.prepare('SELECT * FROM departments').all(),
    rooms: db.prepare('SELECT * FROM rooms').all(),
    templates: db.prepare('SELECT * FROM templates').all(),
    template_items: db.prepare('SELECT * FROM template_items').all(),
    submissions: db.prepare('SELECT * FROM submissions').all(),
  };
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    'attachment; filename="checklist_full_export.json"'
  );
  res.send(JSON.stringify(dump, null, 2));
});

/** Nhắc việc thủ công / xem log */
statsRouter.get('/reminders', (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Chỉ admin.' });
  const rows = db
    .prepare('SELECT * FROM reminder_log ORDER BY id DESC LIMIT 100')
    .all();
  res.json(rows);
});
