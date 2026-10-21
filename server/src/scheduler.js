import fs from 'fs';
import path from 'path';
import cron from 'node-cron';
import { db, getSetting, reportDir, backupDir, dbPath, writeAudit } from './db.js';
import { nowVN } from './time.js';
import { buildChecklistWorkbook, exportFileName } from './excel.js';

function logReminder(rows, channel, message) {
  const ins = db.prepare(
    `INSERT INTO reminder_log (at_time, work_date, room_id, room_name, department_name, channel, message, sent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const t = nowVN();
  for (const r of rows) {
    ins.run(
      t.isoLocal,
      t.date,
      r.id,
      r.name,
      r.department_name,
      channel,
      message,
      1
    );
  }
}

/** Phòng chưa có bản gửi nào trong ngày */
function roomsWithoutSubmissionToday() {
  const { date } = nowVN();
  return db
    .prepare(
      `SELECT r.id, r.name, d.name AS department_name
       FROM rooms r
       JOIN departments d ON d.id = r.department_id
       WHERE r.is_visible = 1 AND d.is_visible = 1
         AND NOT EXISTS (
           SELECT 1 FROM submissions s
           WHERE s.room_id = r.id AND s.work_date = ? AND s.is_hidden = 0
         )`
    )
    .all(date);
}

async function runMorningReminder() {
  const rooms = roomsWithoutSubmissionToday();
  if (!rooms.length) {
    console.log('[nhắc việc] Tất cả phòng đã có checklist hôm nay.');
    return;
  }
  const emails = getSetting('reminder_emails', '');
  const msg = `Chưa có checklist hôm nay (${nowVN().date}): ${rooms
    .map((r) => `${r.department_name}/${r.name}`)
    .join(', ')}`;
  console.log('[nhắc việc]', msg);
  // Gói miễn phí local: ghi log. SMTP bật thì in danh sách email cần gửi.
  if (emails) {
    console.log('[nhắc việc] Gửi tới:', emails);
  }
  logReminder(rooms, emails ? 'email' : 'log', msg);
  writeAudit('system', 'reminder', 'rooms', null, { count: rooms.length, message: msg });
}

async function exportPeriod(from, to, label) {
  const rows = db
    .prepare(
      `SELECT * FROM submissions
       WHERE is_hidden = 0 AND work_date >= ? AND work_date <= ?
       ORDER BY server_time`
    )
    .all(from, to);
  const wb = await buildChecklistWorkbook(rows);
  const filename = `auto_${label}_${exportFileName(from, to)}`;
  const dest = path.join(reportDir, filename);
  await wb.xlsx.writeFile(dest);
  const emails = getSetting('reminder_emails', '');
  console.log(`[báo cáo tự động] Đã tạo ${dest}${emails ? ` — gửi email: ${emails}` : ''}`);
  writeAudit('system', 'auto_report', 'excel', null, { file: dest, from, to });
  return dest;
}

function startOfWeekMonday(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  const day = d.getDay(); // 0 CN
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

async function runWeeklyReport() {
  const { date } = nowVN();
  const from = startOfWeekMonday(date);
  await exportPeriod(from, date, 'tuan');
}

async function runMonthlyReport() {
  const { date } = nowVN();
  const from = date.slice(0, 7) + '-01';
  await exportPeriod(from, date, 'thang');
}

function runDailyBackup() {
  const stamp = nowVN().date;
  const dest = path.join(backupDir, `daily_${stamp}.db`);
  fs.copyFileSync(dbPath, dest);
  // Giữ tối đa ~2000 ngày (~5.5 năm) — xóa file cũ hơn 5 năm nếu có
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - 5);
  for (const f of fs.readdirSync(backupDir)) {
    if (!f.startsWith('daily_')) continue;
    const full = path.join(backupDir, f);
    const st = fs.statSync(full);
    if (st.mtime < cutoff) fs.unlinkSync(full);
  }
  console.log('[sao lưu]', dest);
}

export function startScheduler() {
  // Nhắc 8:30 giờ VN — cron theo local server; khuyến nghị máy chủ set TZ=Asia/Ho_Chi_Minh
  const reminderTime = getSetting('reminder_time', '08:30');
  const [hh, mm] = reminderTime.split(':').map(Number);
  const cronRem = `${mm || 0} ${hh || 8} * * *`;
  cron.schedule(cronRem, () => {
    runMorningReminder().catch(console.error);
  });

  // Cuối tuần: CN 23:00
  cron.schedule('0 23 * * 0', () => {
    runWeeklyReport().catch(console.error);
  });

  // Cuối tháng: ngày cuối tháng 23:10 (chạy mỗi ngày, chỉ khi là ngày cuối)
  cron.schedule('10 23 * * *', () => {
    const { date } = nowVN();
    const [y, m, d] = date.split('-').map(Number);
    const last = new Date(y, m, 0).getDate();
    if (d === last) runMonthlyReport().catch(console.error);
  });

  // Sao lưu 02:00 hằng ngày
  cron.schedule('0 2 * * *', () => {
    try {
      runDailyBackup();
    } catch (e) {
      console.error(e);
    }
  });

  console.log(`Scheduler: nhắc ${reminderTime}, báo cáo tuần/tháng, sao lưu 02:00`);
}

export { runMorningReminder, runWeeklyReport, runMonthlyReport, runDailyBackup };
