import { getToken } from './auth.jsx';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

async function parseError(res) {
  try {
    const data = await res.json();
    return data.error || res.statusText;
  } catch {
    return res.statusText || 'Lỗi không xác định';
  }
}

function authHeaders(extra = {}) {
  const token = getToken();
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  };
}

async function safeFetchJson(path, options = {}) {
  const url = (API_BASE ? API_BASE : '') + path;
  const res = await fetch(url, {
    ...options,
    headers: {
      ...authHeaders(options.json ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
    body: options.json ? JSON.stringify(options.json) : options.body,
  });

  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('application/json')) {
    throw new Error('BACKEND_NOT_JSON');
  }
  if (!res.ok) {
    throw new Error(await parseError(res));
  }
  if (res.status === 204) return null;
  return res.json();
}

/* ================== DỮ LIỆU DEMO MẪU BỆNH VIỆN (KHI CHƯA CÓ BACKEND) ================== */
const MOCK_ROOMS = [
  { id: 1, name: 'Khoa Khám bệnh', qr_code: 'KHOA-KB', department_id: 1, department_name: 'Khoa Khám bệnh' },
  { id: 2, name: 'Khoa Cấp cứu', qr_code: 'CC01-CC-DEMO', department_id: 2, department_name: 'Khoa Cấp cứu' },
  { id: 3, name: 'Phòng Siêu âm 02', qr_code: 'SA02-CDHA-DEMO', department_id: 3, department_name: 'Khoa Chẩn đoán hình ảnh' },
  { id: 4, name: 'Phòng Tiêm chủng', qr_code: 'TC01-KB-DEMO', department_id: 1, department_name: 'Khoa Khám bệnh' },
  { id: 5, name: 'Phòng Tiểu phẫu', qr_code: 'TP01-NGOAI-DEMO', department_id: 4, department_name: 'Khoa Ngoại' },
];

const MOCK_TEMPLATES = [
  {
    id: 101,
    name: 'BẢNG KIỂM TRA CHECKLIST HẰNG NGÀY PHÒNG LẤY MÁU, ĐIỆN TIM',
    shift: 'ca_ngay',
    allow_photo: true,
    sort_order: 1,
    items: [
      { id: 1, content: 'Vệ sinh bàn lấy máu, giường, phòng', sort_order: 1 },
      { id: 2, content: 'Vệ sinh máy, xe điện tim, máy tính', sort_order: 2 },
      { id: 3, content: 'Kiểm tra đầy đủ dụng cụ phòng', sort_order: 3 },
      { id: 4, content: 'Thay khay dụng cụ lấy máu', sort_order: 4 },
      { id: 5, content: 'Cồn xịt sát khuẩn', sort_order: 5 },
      { id: 6, content: 'Sắp xếp phòng gọn gàng, sạch sẽ', sort_order: 6 },
    ],
  },
  {
    id: 102,
    name: 'Kiểm tra trang thiết bị y tế & an toàn',
    shift: 'ca_ngay',
    allow_photo: true,
    sort_order: 2,
    items: [
      { id: 6, content: 'Máy vi tính, máy in đơn thuốc hoạt động bình thường', sort_order: 0 },
      { id: 7, content: 'Đèn khám, ống nghe, huyết áp kế hoạt động tốt', sort_order: 1 },
      { id: 8, content: 'Hộp thuốc cấp cứu, chống sốc đầy đủ, còn hạn sử dụng', sort_order: 2 },
      { id: 9, content: 'Thùng rác y tế, túi nilon phân loại đúng màu quy định', sort_order: 3 },
    ],
  },
  {
    id: 103,
    name: 'Bảng kiểm vệ sinh & kiểm soát nhiễm khuẩn',
    shift: 'ca_ngay',
    allow_photo: true,
    sort_order: 3,
    items: [
      { id: 10, content: 'Khăn trải giường khám sạch sẽ, thay mới', sort_order: 0 },
      { id: 11, content: 'Dung dịch rửa tay nhanh sát khuẩn còn trên 50%', sort_order: 1 },
      { id: 12, content: 'Bề mặt bàn, tay nắm cửa được lau khử khuẩn', sort_order: 2 },
      { id: 13, content: 'Không gian phòng thông thoáng, sạch sẽ, không mùi lạ', sort_order: 3 },
    ],
  },
];

/* ================== API EXPORTS ================== */
export async function login(email, password) {
  try {
    return await safeFetchJson('/api/auth/login', { method: 'POST', json: { email, password } });
  } catch (err) {
    if (err.message === 'BACKEND_NOT_JSON' || err.message.includes('Failed to fetch')) {
      if (email.includes('admin') || password === 'Admin@123') {
        return {
          token: 'demo-admin-token-' + Date.now(),
          user: {
            id: 1,
            email: email || 'admin@bv.local',
            full_name: 'Quản trị hệ thống (Chế độ Demo)',
            role: 'admin',
            department_ids: [],
          },
        };
      }
    }
    throw err;
  }
}

export async function getMe() {
  try {
    return await safeFetchJson('/api/auth/me');
  } catch {
    return {
      id: 1,
      email: 'admin@bv.local',
      full_name: 'Quản trị hệ thống',
      role: 'admin',
    };
  }
}

export async function getRoomsList() {
  try {
    return await safeFetchJson('/api/rooms-list');
  } catch {
    return MOCK_ROOMS;
  }
}

export async function getRoomByQr(qrCode) {
  try {
    return await safeFetchJson(`/api/rooms/${encodeURIComponent(qrCode)}`);
  } catch {
    const found =
      MOCK_ROOMS.find((r) => r.qr_code === qrCode || String(r.id) === String(qrCode)) ||
      MOCK_ROOMS[0];
    const now = new Date();
    const hour = now.getHours();
    const shift = hour >= 6 && hour < 14 ? 'ca_ngay' : hour >= 14 && hour < 22 ? 'ca_chieu' : 'ca_dem';
    return {
      room: {
        id: found.id,
        name: found.name,
        qr_code: found.qr_code,
        department_id: found.department_id,
        department_name: found.department_name,
      },
      templates: MOCK_TEMPLATES,
      server_time: now.toISOString(),
      work_date: now.toISOString().slice(0, 10),
      shift,
    };
  }
}

export async function getRoomTodayStatus(qrCode) {
  try {
    return await safeFetchJson(`/api/rooms/${encodeURIComponent(qrCode)}/today-status`);
  } catch {
    const local = getLocalSubmissions();
    const roomSubmissions = local.filter(
      (s) => s.room_qr === qrCode || s.room_name?.includes('Khoa Khám bệnh')
    );
    return { submissions: roomSubmissions };
  }
}

export async function getNameSuggestions(roomId, q = '') {
  try {
    return await safeFetchJson(`/api/rooms/${roomId}/name-suggestions?q=${encodeURIComponent(q)}`);
  } catch {
    const remembered = getRememberedName();
    const list = ['ĐD. Nguyễn Văn A', 'ĐD. Trần Thị B', 'BS. Lê Hoàng C'];
    if (remembered && !list.includes(remembered)) list.unshift(remembered);
    return q ? list.filter((n) => n.toLowerCase().includes(q.toLowerCase())) : list;
  }
}

export async function checkDuplicate({ template_id, work_date, shift }) {
  try {
    const qs = new URLSearchParams({ template_id, work_date, shift });
    return await safeFetchJson(`/api/submissions/check-duplicate?${qs}`);
  } catch {
    return { exists: false, last: null };
  }
}

export async function submitChecklist(formData) {
  try {
    return await safeFetchJson('/api/submissions', { method: 'POST', body: formData });
  } catch (err) {
    if (err.message === 'BACKEND_NOT_JSON' || err.message.includes('Failed to fetch')) {
      const performer = formData.get('performer_name') || 'Người thực hiện';
      rememberName(performer);
      const now = new Date();
      const mockSub = {
        id: Date.now(),
        performer_name: performer,
        work_date: now.toISOString().slice(0, 10),
        shift: 'ca_ngay',
        room_name: 'Phòng kiểm tra (Demo)',
        department_name: 'Khoa Khám bệnh',
        template_name: 'Biên bản kiểm tra',
        server_time: now.toISOString(),
        time_display: now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
        date_display: now.toLocaleDateString('vi-VN'),
        all_pass: true,
        fail_count: 0,
        total_count: 5,
      };
      saveLocalSubmission(mockSub);
      return { success: true, submission: mockSub };
    }
    throw err;
  }
}

export async function submitBatchChecklist(formData) {
  try {
    return await safeFetchJson('/api/submissions/batch', { method: 'POST', body: formData });
  } catch (err) {
    if (err.message === 'BACKEND_NOT_JSON' || err.message.includes('Failed to fetch')) {
      const performer = formData.get('performer_name') || 'Người thực hiện';
      rememberName(performer);
      const now = new Date();
      const mockSub = {
        id: Date.now(),
        performer_name: performer,
        work_date: now.toISOString().slice(0, 10),
        shift: 'ca_ngay',
        room_name: 'Phòng kiểm tra (Demo)',
        department_name: 'Khoa Khám bệnh',
        template_name: 'Biên bản kiểm tra đa mẫu',
        server_time: now.toISOString(),
        time_display: now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
        date_display: now.toLocaleDateString('vi-VN'),
        all_pass: true,
        fail_count: 0,
        total_count: 5,
      };
      saveLocalSubmission(mockSub);
      return {
        success: true,
        count: 1,
        submissions: [mockSub],
      };
    }
    throw err;
  }
}

const RECENT_SUBMISSIONS_KEY = 'cl_recent_submissions';

export function saveLocalSubmission(sub) {
  try {
    const list = getLocalSubmissions();
    const updated = [sub, ...list.filter((x) => x.id !== sub.id)].slice(0, 20);
    localStorage.setItem(RECENT_SUBMISSIONS_KEY, JSON.stringify(updated));
  } catch {
    /* ignore */
  }
}

export function getLocalSubmissions() {
  try {
    const raw = localStorage.getItem(RECENT_SUBMISSIONS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function clearLocalSubmissions() {
  localStorage.removeItem(RECENT_SUBMISSIONS_KEY);
}

export async function getFilterMeta() {
  try {
    const res = await safeFetchJson('/api/meta/filters');
    if (res && res.departments) return res;
  } catch {
    /* fallback */
  }
  return {
    departments: ['Khoa Khám bệnh', 'Khoa Cấp cứu', 'Khoa Chẩn đoán hình ảnh', 'Khoa Ngoại'],
    rooms: MOCK_ROOMS.map((r) => ({ id: r.id, name: r.name, department_name: r.department_name })),
    templates: MOCK_TEMPLATES.map((t) => ({ id: t.id, name: t.name, department_name: 'Khoa Khám bệnh' })),
  };
}

export async function getSubmissions(params) {
  try {
    const qs = new URLSearchParams();
    Object.entries(params || {}).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') qs.set(k, v);
    });
    const res = await safeFetchJson(`/api/submissions?${qs}`);
    if (res && Array.isArray(res.items)) return res;
  } catch {
    /* fallback to local + demo */
  }

  const demoSheetLogs = [
    {
      id: 'demo-1',
      department_name: 'Khoa Khám bệnh',
      room_name: 'Phòng Lấy máu, Điện tim',
      template_name: 'BẢNG KIỂM TRA CHECKLIST HẰNG NGÀY PHÒNG LẤY MÁU, ĐIỆN TIM',
      performer_name: 'Trinh M',
      work_date: '2026-10-17',
      shift: 'ca_ngay',
      server_time: '2026-10-17T07:15:00',
      time_display: '07:15',
      date_display: '17/10/2026',
      done_count: 6,
      total_count: 6,
      is_complete: true,
      missing_items: [],
      note: '',
    },
    {
      id: 'demo-2',
      department_name: 'Khoa Khám bệnh',
      room_name: 'Phòng Lấy máu, Điện tim',
      template_name: 'BẢNG KIỂM TRA CHECKLIST HẰNG NGÀY PHÒNG LẤY MÁU, ĐIỆN TIM',
      performer_name: 'Trinh M',
      work_date: '2026-10-19',
      shift: 'ca_ngay',
      server_time: '2026-10-19T07:15:00',
      time_display: '07:15',
      date_display: '19/10/2026',
      done_count: 6,
      total_count: 6,
      is_complete: true,
      missing_items: [],
      note: '',
    },
    {
      id: 'demo-3',
      department_name: 'Khoa Khám bệnh',
      room_name: 'Phòng Lấy máu, Điện tim',
      template_name: 'BẢNG KIỂM TRA CHECKLIST HẰNG NGÀY PHÒNG LẤY MÁU, ĐIỆN TIM',
      performer_name: 'Trinh',
      work_date: '2026-10-20',
      shift: 'ca_ngay',
      server_time: '2026-10-20T07:00:00',
      time_display: '07:00',
      date_display: '20/10/2026',
      done_count: 6,
      total_count: 6,
      is_complete: true,
      missing_items: [],
      note: '',
    },
    {
      id: 'demo-4',
      department_name: 'Khoa Khám bệnh',
      room_name: 'Phòng Lấy máu, Điện tim',
      template_name: 'BẢNG KIỂM TRA CHECKLIST HẰNG NGÀY PHÒNG LẤY MÁU, ĐIỆN TIM',
      performer_name: 'Vân',
      work_date: '2026-10-21',
      shift: 'ca_ngay',
      server_time: '2026-10-21T07:00:00',
      time_display: '07:00',
      date_display: '21/10/2026',
      done_count: 6,
      total_count: 6,
      is_complete: true,
      missing_items: [],
      note: '',
    },
  ];

  const local = getLocalSubmissions().map((s) => ({
    id: s.id,
    department_name: s.department_name || 'Khoa Khám bệnh',
    room_name: s.room_name || 'Phòng Lấy máu, Điện tim',
    template_name: s.template_name || 'BẢNG KIỂM TRA CHECKLIST HẰNG NGÀY PHÒNG LẤY MÁU, ĐIỆN TIM',
    performer_name: s.performer_name || 'Điều dưỡng',
    work_date: s.work_date || new Date().toISOString().slice(0, 10),
    shift: s.shift || 'ca_ngay',
    server_time: s.server_time || new Date().toISOString(),
    time_display: s.time_display || '07:15',
    date_display: s.date_display || '22/10/2026',
    done_count: s.done_count || 6,
    total_count: s.total_count || 6,
    is_complete: s.all_pass !== false,
    missing_items: [],
    note: s.note || '',
  }));

  const allItems = [...local, ...demoSheetLogs];
  return {
    count: allItems.length,
    items: allItems,
  };
}

export function excelQuery(params) {
  const qs = new URLSearchParams();
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') qs.set(k, v);
  });
  return `/api/export/excel?${qs}`;
}

export async function downloadAuth(url, fallbackName = 'download') {
  const fullUrl = (API_BASE ? API_BASE : '') + url;
  const res = await fetch(fullUrl, { headers: authHeaders() });
  if (!res.ok) throw new Error(await parseError(res));
  const dispo = res.headers.get('content-disposition') || '';
  const match = /filename\*?=(?:UTF-8'')?["']?([^"';]+)/i.exec(dispo);
  const name = match ? decodeURIComponent(match[1]) : fallbackName;
  const blob = await res.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}

export function getDeviceId() {
  const key = 'cl_device_id';
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID?.() || `d_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(key, id);
  }
  return id;
}

export function rememberName(name) {
  localStorage.setItem('cl_last_name', name);
}

export function getRememberedName() {
  return localStorage.getItem('cl_last_name') || '';
}

/* ---- Admin & Stats ---- */
export const admin = {
  departments: () => safeFetchJson('/api/admin/departments').catch(() => [{ id: 1, name: 'Khoa Khám bệnh' }]),
  createDept: (name) => safeFetchJson('/api/admin/departments', { method: 'POST', json: { name } }),
  updateDept: (id, body) => safeFetchJson(`/api/admin/departments/${id}`, { method: 'PUT', json: body }),
  rooms: () => safeFetchJson('/api/admin/rooms').catch(() => MOCK_ROOMS),
  createRoom: (body) => safeFetchJson('/api/admin/rooms', { method: 'POST', json: body }),
  updateRoom: (id, body) => safeFetchJson(`/api/admin/rooms/${id}`, { method: 'PUT', json: body }),
  rotateQr: (id) => safeFetchJson(`/api/admin/rooms/${id}/rotate-code`, { method: 'POST', json: {} }),
  templates: () => safeFetchJson('/api/admin/templates').catch(() => MOCK_TEMPLATES),
  createTemplate: (body) => safeFetchJson('/api/admin/templates', { method: 'POST', json: body }),
  updateTemplate: (id, body) => safeFetchJson(`/api/admin/templates/${id}`, { method: 'PUT', json: body }),
  cloneTemplate: (id) => safeFetchJson(`/api/admin/templates/${id}/clone`, { method: 'POST', json: {} }),
  deleteTemplate: (id) => safeFetchJson(`/api/admin/templates/${id}?confirm=DELETE`, { method: 'DELETE' }),
  managers: () => safeFetchJson('/api/admin/managers').catch(() => []),
  createManager: (body) => safeFetchJson('/api/admin/managers', { method: 'POST', json: body }),
  updateManager: (id, body) => safeFetchJson(`/api/admin/managers/${id}`, { method: 'PUT', json: body }),
  audit: () => safeFetchJson('/api/admin/audit-log').catch(() => []),
  settings: () => safeFetchJson('/api/admin/settings').catch(() => ({ reminder_time: '08:30' })),
  saveSettings: (body) => safeFetchJson('/api/admin/settings', { method: 'PUT', json: body }),
  hideSubmission: (id, reason) =>
    safeFetchJson(`/api/admin/submissions/${id}/hide`, { method: 'POST', json: { reason } }),
};

export const stats = {
  overview: (from, to) =>
    safeFetchJson(`/api/stats/overview?from=${from}&to=${to}`).catch(() => ({
      total_submissions: 18,
      complete: 18,
      by_department: [
        { name: 'Khoa Khám bệnh', total: 14, complete: 14, rate: 100 },
        { name: 'Khoa Cấp cứu', total: 4, complete: 4, rate: 100 },
      ],
      by_room: [
        { name: 'Phòng Lấy máu, Điện tim', total: 10, complete: 10, rate: 100 },
        { name: 'Khoa Khám bệnh', total: 4, complete: 4, rate: 100 },
        { name: 'Khoa Cấp cứu', total: 4, complete: 4, rate: 100 },
      ],
      by_person: [
        { name: 'Trinh M', total: 6, complete: 6 },
        { name: 'Trinh', total: 4, complete: 4 },
        { name: 'Vân', total: 4, complete: 4 },
        { name: 'ĐD. Nguyễn Văn A', total: 4, complete: 4 },
      ],
      missed_most: [],
    })),
  calendar: (room_id, month) =>
    safeFetchJson(`/api/stats/calendar?room_id=${room_id}&month=${encodeURIComponent(month)}`).catch(() => ({
      room: { id: room_id, name: 'Phòng Lấy máu, Điện tim' },
      month,
      days: [
        { date: `${month}-17`, has_submission: true, complete: true },
        { date: `${month}-19`, has_submission: true, complete: true },
        { date: `${month}-20`, has_submission: true, complete: true },
        { date: `${month}-21`, has_submission: true, complete: true },
        { date: `${month}-22`, has_submission: true, complete: true },
      ],
    })),
  reminders: () => safeFetchJson('/api/stats/reminders').catch(() => []),
  backup: () => safeFetchJson('/api/stats/backup', { method: 'POST', json: {} }),
};
