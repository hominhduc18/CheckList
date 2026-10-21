import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { formatDateVN, formatTimeVN } from './time.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fontPath = path.join(__dirname, '..', 'assets', 'fonts', 'NotoSans-Regular.ttf');

function parseJson(v, fallback) {
  try {
    return typeof v === 'string' ? JSON.parse(v) : v ?? fallback;
  } catch {
    return fallback;
  }
}

async function loadFont(pdf) {
  pdf.registerFontkit(fontkit);
  if (!fs.existsSync(fontPath)) {
    throw new Error('Thiếu font NotoSans-Regular.ttf trong server/assets/fonts');
  }
  return pdf.embedFont(fs.readFileSync(fontPath));
}

/** PDF một bản ghi lẻ — A4 ngang */
export async function buildSubmissionPdf(submission) {
  const pdf = await PDFDocument.create();
  const font = await loadFont(pdf);
  const page = pdf.addPage([841.89, 595.28]); // A4 landscape
  const blue = rgb(0.04, 0.36, 0.67);
  const black = rgb(0.1, 0.1, 0.1);
  let y = 560;

  const text = (t, x, yy, size = 11, color = black) => {
    page.drawText(String(t || ''), { x, y: yy, size, font, color });
  };

  text('PHIẾU CHECKLIST HẰNG NGÀY', 40, y, 16, blue);
  y -= 28;
  text(`Khoa: ${submission.department_name}`, 40, y, 12, blue);
  text(`Phòng: ${submission.room_name}`, 320, y, 12, blue);
  y -= 18;
  text(`Mẫu: ${submission.template_name}`, 40, y, 11, blue);
  text(
    `Ngày: ${formatDateVN(submission.work_date)}  Giờ: ${formatTimeVN(submission.server_time)}`,
    320,
    y,
    11,
    blue
  );
  y -= 18;
  text(`Người thực hiện: ${submission.performer_name}`, 40, y, 11, blue);
  y -= 28;

  const items = parseJson(submission.items_snapshot, []);
  const ticks = parseJson(submission.tick_results, {});

  text('STT', 40, y, 10, blue);
  text('Nội dung', 70, y, 10, blue);
  text('Kết quả', 700, y, 10, blue);
  y -= 4;
  page.drawLine({ start: { x: 40, y }, end: { x: 800, y }, thickness: 1, color: blue });
  y -= 18;

  items.forEach((it, idx) => {
    if (y < 80) return;
    const ok = ticks[String(it.id)] === true;
    text(String(idx + 1), 40, y, 10, blue);
    text(it.content, 70, y, 10, blue);
    text(ok ? '✓ Đã làm' : '✗ Chưa làm', 700, y, 10, ok ? rgb(0.1, 0.45, 0.2) : rgb(0.7, 0.15, 0.1));
    y -= 18;
  });

  y -= 10;
  text(`Ghi chú: ${submission.note || '(không)'}`, 40, y, 10, blue);
  y -= 40;
  text('Chữ ký quản lý: ________________________', 40, y, 11, blue);
  text('Ngày ký: ____/____/________', 420, y, 11, blue);

  return Buffer.from(await pdf.save());
}

/**
 * Báo cáo tháng theo phòng — A4 ngang, dạng bảng
 * days: [{ date, submissions: [...] }]
 */
export async function buildRoomMonthPdf({
  departmentName,
  roomName,
  yearMonth,
  itemHeaders,
  dayRows,
}) {
  const pdf = await PDFDocument.create();
  const font = await loadFont(pdf);
  const page = pdf.addPage([841.89, 595.28]);
  const blue = rgb(0.04, 0.36, 0.67);
  let y = 560;

  const text = (t, x, yy, size = 9) => {
    page.drawText(String(t ?? ''), { x, y: yy, size, font, color: blue });
  };

  text(`BẢNG CHECKLIST THÁNG ${yearMonth}`, 40, y, 14);
  y -= 20;
  text(`Khoa: ${departmentName}   Phòng: ${roomName}`, 40, y, 11);
  y -= 24;

  // Header
  const cols = ['Ngày', 'Giờ', ...itemHeaders.map((h) => h.slice(0, 18)), 'Ký tên'];
  let x = 30;
  const widths = [55, 40, ...itemHeaders.map(() => Math.min(70, 480 / Math.max(itemHeaders.length, 1))), 90];
  cols.forEach((c, i) => {
    text(c, x, y, 8);
    x += widths[i] || 60;
  });
  y -= 6;
  page.drawLine({ start: { x: 30, y }, end: { x: 810, y }, thickness: 0.8, color: blue });
  y -= 14;

  for (const row of dayRows) {
    if (y < 70) break;
    x = 30;
    const vals = [
      formatDateVN(row.date),
      row.time || '',
      ...itemHeaders.map((_, i) => row.marks[i] || ''),
      row.signer || '',
    ];
    vals.forEach((v, i) => {
      text(v, x, y, 8);
      x += widths[i] || 60;
    });
    y -= 14;
  }

  y = Math.min(y, 60);
  text('Chữ ký quản lý khoa: ____________________________', 40, 40, 11);
  text('Ngày: ____/____/________', 480, 40, 11);

  return Buffer.from(await pdf.save());
}
