import * as XLSX from 'xlsx';

/**
 * Xuất file Excel cho 1 biên bản vừa làm xong (Màn hình hoàn thành)
 */
export function exportSingleSubmissionExcel(submission, roomData) {
  const wb = XLSX.utils.book_new();

  const deptStr = roomData?.room?.department_name || submission.department_name || 'Khoa khám bệnh';
  const roomStr = roomData?.room?.name || submission.room_name || 'Phòng Lấy máu, Điện tim';
  const signer = submission.performer_name || 'Người thực hiện';
  const timeStr = `${submission.time_display || ''} ${submission.date_display || ''}`.trim();

  const data = [
    ['BỆNH VIỆN QUỐC TẾ CHẤN THƯƠNG CHỈNH HÌNH SÀI GÒN - SAIGON ITO'],
    ['BIÊN BẢN KIỂM TRA CHECKLIST ĐIỆN TỬ'],
    [],
    ['Khoa / Phòng:', `${deptStr} — ${roomStr}`],
    ['Người thực hiện:', signer],
    ['Thời gian thực hiện:', timeStr],
    ['Ghi chú:', submission.note || 'Không có'],
    [],
  ];

  const templates = submission.templates || [];
  if (templates.length > 0) {
    templates.forEach((tpl, tIdx) => {
      data.push([`MẪU ${tIdx + 1}: ${tpl.template_name || 'BẢNG KIỂM TRA CHECKLIST'}`]);
      data.push(['STT', 'Nội dung tiêu chí kiểm tra', 'Đánh giá']);
      if (Array.isArray(tpl.items) && tpl.items.length > 0) {
        tpl.items.forEach((it, iIdx) => {
          data.push([iIdx + 1, it.content, it.passed ? 'ĐẠT ✓' : 'CHƯA ĐẠT ✗']);
        });
      } else {
        data.push(['1', 'Kiểm tra đầy đủ tiêu chuẩn quy định', tpl.is_complete ? 'ĐẠT ✓' : 'CHƯA ĐẠT ✗']);
      }
      data.push([]);
    });
  } else {
    data.push(['STT', 'Tiêu chí kiểm tra', 'Đánh giá']);
    data.push(['1', 'Vệ sinh bàn lấy máu, giường, phòng', 'ĐẠT ✓']);
    data.push(['2', 'Vệ sinh máy, xe điện tim, máy tính', 'ĐẠT ✓']);
    data.push(['3', 'Kiểm tra đầy đủ dụng cụ phòng', 'ĐẠT ✓']);
    data.push(['4', 'Thay khay dụng cụ lấy máu', 'ĐẠT ✓']);
    data.push(['5', 'Cồn xịt sát khuẩn', 'ĐẠT ✓']);
    data.push(['6', 'Sắp xếp phòng gọn gàng, sạch sẽ', 'ĐẠT ✓']);
  }

  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [
    { wch: 10 }, // STT
    { wch: 55 }, // Nội dung
    { wch: 22 }, // Đánh giá
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Bien_Ban_Checklist');

  const cleanName = signer.replace(/\s+/g, '_');
  const dateStr = (submission.date_display || '2026-10-22').replace(/\//g, '-');
  XLSX.writeFile(wb, `Checklist_${deptStr.replace(/\s+/g, '_')}_${dateStr}_${cleanName}.xlsx`);
}

/**
 * Xuất danh sách các biên bản trong trang Lịch sử
 */
export function exportSubmissionsListExcel(items = [], filename = 'Danh_sach_checklist.xlsx') {
  const wb = XLSX.utils.book_new();

  const headers = [
    'STT',
    'Ngày kiểm tra',
    'Giờ thực hiện',
    'Khoa',
    'Phòng',
    'Mẫu checklist',
    'Người ký / Thực hiện',
    'Kết quả',
    'Số mục đạt',
    'Ghi chú',
  ];

  const rows = items.map((item, index) => [
    index + 1,
    item.date_display || item.work_date || '',
    item.time_display || '',
    item.department_name || '',
    item.room_name || '',
    item.template_name || '',
    item.performer_name || '',
    item.is_complete ? 'ĐẠT' : 'CHƯA ĐẠT',
    `${item.done_count || 6}/${item.total_count || 6}`,
    item.note || '',
  ]);

  const data = [
    ['BỆNH VIỆN QUỐC TẾ CHẤN THƯƠNG CHỈNH HÌNH SÀI GÒN - SAIGON ITO'],
    ['BÁO CÁO TỔNG HỢP CHECKLIST HẰNG NGÀY'],
    [],
    headers,
    ...rows,
  ];

  const ws = XLSX.utils.aoa_to_sheet(data);

  ws['!cols'] = [
    { wch: 6 },  // STT
    { wch: 14 }, // Ngày
    { wch: 12 }, // Giờ
    { wch: 20 }, // Khoa
    { wch: 24 }, // Phòng
    { wch: 38 }, // Mẫu
    { wch: 20 }, // Người ký
    { wch: 12 }, // Kết quả
    { wch: 12 }, // Số mục
    { wch: 30 }, // Ghi chú
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Tong_Hop_Checklist');
  XLSX.writeFile(wb, filename);
}
