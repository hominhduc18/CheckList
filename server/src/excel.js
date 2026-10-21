import ExcelJS from 'exceljs';
import { formatDateVN, formatTimeVN, shiftLabel } from './time.js';

/** Làm sạch tên sheet Excel (tối đa 31 ký tự, bỏ ký tự cấm) */
function safeSheetName(name, used) {
  let base = String(name || 'Sheet')
    .replace(/[\\/*?:\[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 31);
  if (!base) base = 'Sheet';
  let candidate = base;
  let i = 2;
  while (used.has(candidate.toLowerCase())) {
    const suffix = ` (${i})`;
    candidate = (base.slice(0, 31 - suffix.length) + suffix).trim();
    i += 1;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

function parseJson(v, fallback) {
  try {
    return typeof v === 'string' ? JSON.parse(v) : v ?? fallback;
  } catch {
    return fallback;
  }
}

/**
 * Tạo workbook Excel từ danh sách submissions.
 * - Sheet "Tổng hợp"
 * - Mỗi (khoa + mẫu) một sheet dạng bảng giấy
 */
export async function buildChecklistWorkbook(submissions) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Checklist BV';
  wb.created = new Date();

  const usedNames = new Set();

  // ---- Sheet Tổng hợp ----
  const summary = wb.addWorksheet(safeSheetName('Tổng hợp', usedNames));
  summary.columns = [
    { header: 'Ngày', key: 'ngay', width: 12 },
    { header: 'Giờ', key: 'gio', width: 8 },
    { header: 'Khoa', key: 'khoa', width: 22 },
    { header: 'Phòng', key: 'phong', width: 22 },
    { header: 'Mẫu', key: 'mau', width: 22 },
    { header: 'Người thực hiện', key: 'nguoi', width: 18 },
    { header: 'Số mục đã làm', key: 'daLam', width: 14 },
    { header: 'Tổng số mục', key: 'tong', width: 12 },
    { header: 'Trạng thái', key: 'tt', width: 12 },
    { header: 'Ghi chú', key: 'ghichu', width: 30 },
    { header: 'Bổ sung', key: 'bosung', width: 10 },
  ];

  styleHeader(summary);

  const sorted = [...submissions].sort((a, b) =>
    String(a.server_time).localeCompare(String(b.server_time))
  );

  for (const s of sorted) {
    const items = parseJson(s.items_snapshot, []);
    const ticks = parseJson(s.tick_results, {});
    const total = items.length;
    const done = items.filter((it) => ticks[String(it.id)] === true).length;
    const enough = done === total && total > 0;
    const row = summary.addRow({
      ngay: formatDateVN(s.work_date),
      gio: formatTimeVN(s.server_time),
      khoa: s.department_name,
      phong: s.room_name,
      mau: s.template_name,
      nguoi: s.performer_name,
      daLam: done,
      tong: total,
      tt: enough ? 'Đủ' : 'Thiếu',
      ghichu: s.note || '',
      bosung: s.is_supplement ? 'Có' : '',
    });
    if (!enough) {
      row.getCell('tt').fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFFCCCC' },
      };
      row.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFFF0F0' },
      };
    }
    applyBorders(row);
  }

  summary.views = [{ state: 'frozen', ySplit: 1 }];

  // ---- Sheet theo mẫu (gộp cột mục qua lịch sử) ----
  /** key: khoa||mẫu */
  const groups = new Map();
  for (const s of sorted) {
    const key = `${s.department_name}||${s.template_name}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(s);
  }

  for (const [key, rows] of groups) {
    const [deptName, tplName] = key.split('||');
    const sheetName = safeSheetName(`${deptName} - ${tplName}`, usedNames);
    const ws = wb.addWorksheet(sheetName);

    // Gom tất cả mục từng xuất hiện (giữ thứ tự lần đầu gặp)
    const itemCols = [];
    const seen = new Set();
    for (const s of rows) {
      const items = parseJson(s.items_snapshot, []);
      for (const it of items) {
        const id = String(it.id);
        if (!seen.has(id)) {
          seen.add(id);
          itemCols.push({ id, content: it.content });
        }
      }
    }

    const headers = ['Ngày', 'Giờ', ...itemCols.map((c) => c.content), 'Ký tên', 'Ghi chú'];
    const title = ws.addRow([
      `Khoa: ${deptName} | Mẫu: ${tplName} | Ca: ${shiftLabel(rows[0]?.shift || 'ca_ngay')}`,
    ]);
    title.font = { italic: true, size: 10 };
    ws.mergeCells(1, 1, 1, Math.max(headers.length, 1));

    const headerRow = ws.addRow(headers);
    headerRow.font = { bold: true };
    headerRow.alignment = { vertical: 'middle', wrapText: true };
    applyBorders(headerRow);
    headerRow.eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE8EEF5' },
      };
    });

    headers.forEach((_, i) => {
      const col = ws.getColumn(i + 1);
      col.width =
        i < 2
          ? 12
          : i >= headers.length - 2
            ? 18
            : Math.min(28, Math.max(12, String(headers[i]).length + 2));
    });

    for (const s of rows) {
      const items = parseJson(s.items_snapshot, []);
      const ticks = parseJson(s.tick_results, {});
      const itemIds = new Set(items.map((it) => String(it.id)));
      const total = items.length;
      const done = items.filter((it) => ticks[String(it.id)] === true).length;
      const enough = done === total && total > 0;

      const values = [
        formatDateVN(s.work_date),
        formatTimeVN(s.server_time),
        ...itemCols.map((c) => {
          if (!itemIds.has(c.id)) return '';
          return ticks[c.id] === true ? '✓' : '✗';
        }),
        s.performer_name,
        s.note || '',
      ];
      const row = ws.addRow(values);
      applyBorders(row);

      itemCols.forEach((_, idx) => {
        const cell = row.getCell(3 + idx);
        if (cell.value === '✗') {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFFCCCC' },
          };
          cell.alignment = { horizontal: 'center' };
        } else if (cell.value === '✓') {
          cell.alignment = { horizontal: 'center' };
        }
      });
      if (!enough) {
        row.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFFF0F0' },
        };
      }
    }

    ws.views = [{ state: 'frozen', ySplit: 2 }];
  }

  return wb;
}

function styleHeader(ws) {
  const row = ws.getRow(1);
  row.font = { bold: true };
  row.alignment = { vertical: 'middle', wrapText: true };
  applyBorders(row);
  row.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE8EEF5' },
    };
  });
}

function applyBorders(row) {
  row.eachCell({ includeEmpty: true }, (cell) => {
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFB0B0B0' } },
      left: { style: 'thin', color: { argb: 'FFB0B0B0' } },
      bottom: { style: 'thin', color: { argb: 'FFB0B0B0' } },
      right: { style: 'thin', color: { argb: 'FFB0B0B0' } },
    };
  });
}

export function exportFileName(from, to) {
  if (from === to) return `checklist_${from}.xlsx`;
  return `checklist_${from}_den_${to}.xlsx`;
}
