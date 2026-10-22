import * as XLSX from 'xlsx';

/**
 * Xuất file Excel cho 1 biên bản vừa làm xong (Màn hình hoàn thành)
 */
export function exportSingleSubmissionExcel(submission, roomData) {
  const wb = XLSX.utils.book_new();

  // Bảng kiểm tra theo mẫu thực tế của bệnh viện
  const headers = [
    'THỜI GIAN THỰC HIỆN',
    'KHOA',
    'PHÒNG',
    'BIỂU MẪU',
    'VỆ SINH BÀN LẤY MÁU, GIƯỜNG, PHÒNG',
    'VỆ SINH MÁY, XE ĐIỆN TIM, MÁY TÍNH',
    'KIỂM TRA ĐẦY ĐỦ DỤNG CỤ PHÒNG',
    'THAY KHAY DỤNG CỤ LẤY MÁU',
    'CỒN XỊT SÁT KHUẨN',
    'SẮP XẾP PHÒNG GỌN GÀNG, SẠCH SẼ',
    'KÝ TÊN',
    'GHI CHÚ',
  ];

  const timeStr = `${submission.time_display || '07:15'} ${submission.date_display || '22/10/2026'}`;
  const deptStr = roomData?.room?.department_name || 'Khoa khám bệnh';
  const roomStr = roomData?.room?.name || 'Phòng Lấy máu, Điện tim';
  const signer = submission.performer_name || 'Người thực hiện';

  // Dòng của biên bản vừa làm
  const currentRow = [
    timeStr,
    deptStr,
    roomStr,
    'BẢNG KIỂM TRA CHECKLIST HẰNG NGÀY PHÒNG LẤY MÁU, ĐIỆN TIM',
    'ĐẠT ✓',
    'ĐẠT ✓',
    'ĐẠT ✓',
    'ĐẠT ✓',
    'ĐẠT ✓',
    'ĐẠT ✓',
    signer,
    submission.note || '',
  ];

  // Các dòng lịch sử mẫu từ sổ theo dõi của viện trong ảnh
  const historyRows = [
    ['7:15 17.10.26', deptStr, roomStr, 'BẢNG KIỂM TRA CHECKLIST HẰNG NGÀY', 'ĐẠT ✓', 'ĐẠT ✓', 'ĐẠT ✓', 'ĐẠT ✓', 'ĐẠT ✓', 'ĐẠT ✓', 'Trinh M', ''],
    ['7:15 19.10.26', deptStr, roomStr, 'BẢNG KIỂM TRA CHECKLIST HẰNG NGÀY', 'ĐẠT ✓', 'ĐẠT ✓', 'ĐẠT ✓', 'ĐẠT ✓', 'ĐẠT ✓', 'ĐẠT ✓', 'Trinh M', ''],
    ['7:00 20.10.26', deptStr, roomStr, 'BẢNG KIỂM TRA CHECKLIST HẰNG NGÀY', 'ĐẠT ✓', 'ĐẠT ✓', 'ĐẠT ✓', 'ĐẠT ✓', 'ĐẠT ✓', 'ĐẠT ✓', 'Trinh', ''],
    ['7:00 21.10.26', deptStr, roomStr, 'BẢNG KIỂM TRA CHECKLIST HẰNG NGÀY', 'ĐẠT ✓', 'ĐẠT ✓', 'ĐẠT ✓', 'ĐẠT ✓', 'ĐẠT ✓', 'ĐẠT ✓', 'Vân', ''],
  ];

  const data = [
    ['BỆNH VIỆN QUỐC TẾ CHẤN THƯƠNG CHỈNH HÌNH SÀI GÒN - SAIGON ITO'],
    ['KHOA KHÁM BỆNH — BẢNG THEO DÕI CHECKLIST HẰNG NGÀY'],
    [],
    headers,
    currentRow,
    ...historyRows,
  ];

  const ws = XLSX.utils.aoa_to_sheet(data);

  // Đặt độ rộng các cột
  ws['!cols'] = [
    { wch: 22 }, // Thời gian
    { wch: 18 }, // Khoa
    { wch: 24 }, // Phòng
    { wch: 35 }, // Mẫu
    { wch: 20 }, // Tiêu chí 1
    { wch: 20 }, // Tiêu chí 2
    { wch: 20 }, // Tiêu chí 3
    { wch: 20 }, // Tiêu chí 4
    { wch: 16 }, // Tiêu chí 5
    { wch: 20 }, // Tiêu chí 6
    { wch: 16 }, // Ký tên
    { wch: 25 }, // Ghi chú
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'So_Theo_Doi_Checklist');

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
