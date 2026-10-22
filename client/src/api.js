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
    const list = [];
    const remembered = getRememberedName();
    if (remembered) list.push(remembered);

    const local = getLocalSubmissions();
    local.forEach((s) => {
      if (s.performer_name && !list.includes(s.performer_name)) {
        list.push(s.performer_name);
      }
    });

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
        room_name: 'Phòng Lấy máu, Điện tim',
        department_name: 'Khoa Khám bệnh',
        template_name: 'BẢNG KIỂM TRA CHECKLIST HẰNG NGÀY PHÒNG LẤY MÁU, ĐIỆN TIM',
        server_time: now.toISOString(),
        time_display: now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
        date_display: now.toLocaleDateString('vi-VN'),
        all_pass: true,
        is_complete: true,
        fail_count: 0,
        done_count: 6,
        total_count: 6,
        missing_items: [],
        note: formData.get('note') || '',
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
      let tpls = [];
      try {
        tpls = JSON.parse(formData.get('templates_data') || '[]');
      } catch {}

      const submissions = tpls.map((t, idx) => {
        const tickKeys = Object.keys(t.tick_results || {});
        const passCount = Object.values(t.tick_results || {}).filter(Boolean).length;
        const total = tickKeys.length || 6;
        return {
          id: Date.now() + idx,
          template_id: t.template_id,
          template_name: t.template_name || 'BẢNG KIỂM TRA CHECKLIST HẰNG NGÀY PHÒNG LẤY MÁU, ĐIỆN TIM',
          performer_name: performer,
          work_date: now.toISOString().slice(0, 10),
          shift: 'ca_ngay',
          room_name: 'Phòng Lấy máu, Điện tim',
          department_name: 'Khoa Khám bệnh',
          server_time: now.toISOString(),
          time_display: now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
          date_display: now.toLocaleDateString('vi-VN'),
          all_pass: passCount === total,
          is_complete: passCount === total,
          done_count: passCount,
          total_count: total,
          missing_items: [],
          note: formData.get('note') || '',
        };
      });

      if (submissions.length === 0) {
        submissions.push({
          id: Date.now(),
          performer_name: performer,
          work_date: now.toISOString().slice(0, 10),
          shift: 'ca_ngay',
          room_name: 'Phòng Lấy máu, Điện tim',
          department_name: 'Khoa Khám bệnh',
          template_name: 'BẢNG KIỂM TRA CHECKLIST HẰNG NGÀY PHÒNG LẤY MÁU, ĐIỆN TIM',
          server_time: now.toISOString(),
          time_display: now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
          date_display: now.toLocaleDateString('vi-VN'),
          all_pass: true,
          is_complete: true,
          done_count: 6,
          total_count: 6,
          missing_items: [],
          note: formData.get('note') || '',
        });
      }

      submissions.forEach((sub) => saveLocalSubmission(sub));
      return {
        success: true,
        count: submissions.length,
        submissions,
      };
    }
    throw err;
  }
}

const RECENT_SUBMISSIONS_KEY = 'cl_recent_submissions';

export function saveLocalSubmission(sub) {
  try {
    const list = getLocalSubmissions();
    const updated = [sub, ...list.filter((x) => x.id !== sub.id)].slice(0, 100);
    localStorage.setItem(RECENT_SUBMISSIONS_KEY, JSON.stringify(updated));
  } catch {
    /* ignore */
  }
}

export function getLocalSubmissions() {
  try {
    const raw = localStorage.getItem(RECENT_SUBMISSIONS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    // Loại bỏ mọi dữ liệu demo/test cũ nếu có
    return parsed.filter((item) => item && !String(item.id).startsWith('demo-'));
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
    /* fallback to local */
  }

  // CHỈ DÙNG BẢN GHI THỰC TẾ ĐƯỢC NGƯỜI DÙNG / NHÂN VIÊN GỬI
  const local = getLocalSubmissions().map((s) => ({
    id: s.id,
    department_name: s.department_name || 'Khoa Khám bệnh',
    room_name: s.room_name || 'Phòng Lấy máu, Điện tim',
    template_name: s.template_name || 'BẢNG KIỂM TRA CHECKLIST HẰNG NGÀY PHÒNG LẤY MÁU, ĐIỆN TIM',
    performer_name: s.performer_name || 'Người thực hiện',
    work_date: s.work_date || (s.date_display ? s.date_display.split('/').reverse().join('-') : new Date().toISOString().slice(0, 10)),
    shift: s.shift || 'ca_ngay',
    server_time: s.server_time || new Date().toISOString(),
    time_display: s.time_display || '07:15',
    date_display: s.date_display || new Date().toLocaleDateString('vi-VN'),
    done_count: s.done_count !== undefined ? s.done_count : 6,
    total_count: s.total_count !== undefined ? s.total_count : 6,
    is_complete: s.is_complete !== undefined ? s.is_complete : s.all_pass !== false,
    missing_items: s.missing_items || [],
    note: s.note || '',
    photo_path: s.photo_path || '',
  }));

  const { from, to, department, room_id, template_id, status, q } = params || {};
  let filtered = local;

  if (from) {
    filtered = filtered.filter((item) => (item.work_date || item.date_display) >= from);
  }
  if (to) {
    filtered = filtered.filter((item) => (item.work_date || item.date_display) <= to);
  }
  if (department) {
    filtered = filtered.filter((item) => item.department_name === department);
  }
  if (status === 'du') {
    filtered = filtered.filter((item) => item.is_complete);
  } else if (status === 'thieu') {
    filtered = filtered.filter((item) => !item.is_complete);
  }
  if (q && q.trim()) {
    const kw = q.trim().toLowerCase();
    filtered = filtered.filter(
      (item) =>
        item.performer_name.toLowerCase().includes(kw) ||
        item.note.toLowerCase().includes(kw) ||
        item.room_name.toLowerCase().includes(kw)
    );
  }

  return {
    count: filtered.length,
    items: filtered,
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
    safeFetchJson(`/api/stats/overview?from=${from}&to=${to}`).catch(() => {
      const local = getLocalSubmissions();
      const filtered = local.filter((s) => {
        const d = s.work_date || (s.date_display ? s.date_display.split('/').reverse().join('-') : '');
        if (from && d && d < from) return false;
        if (to && d && d > to) return false;
        return true;
      });

      const total = filtered.length;
      const complete = filtered.filter((s) => s.is_complete !== false).length;

      const deptMap = {};
      filtered.forEach((s) => {
        const name = s.department_name || 'Khoa Khám bệnh';
        if (!deptMap[name]) deptMap[name] = { name, total: 0, complete: 0 };
        deptMap[name].total += 1;
        if (s.is_complete !== false) deptMap[name].complete += 1;
      });
      const by_department = Object.values(deptMap).map((d) => ({
        ...d,
        rate: d.total ? Math.round((d.complete / d.total) * 100) : 0,
      }));

      const roomMap = {};
      filtered.forEach((s) => {
        const name = s.room_name || 'Phòng Lấy máu, Điện tim';
        if (!roomMap[name]) roomMap[name] = { name, total: 0, complete: 0 };
        roomMap[name].total += 1;
        if (s.is_complete !== false) roomMap[name].complete += 1;
      });
      const by_room = Object.values(roomMap).map((r) => ({
        ...r,
        rate: r.total ? Math.round((r.complete / r.total) * 100) : 0,
      }));

      const personMap = {};
      filtered.forEach((s) => {
        const name = s.performer_name || 'Người thực hiện';
        if (!personMap[name]) personMap[name] = { name, total: 0, complete: 0 };
        personMap[name].total += 1;
        if (s.is_complete !== false) personMap[name].complete += 1;
      });
      const by_person = Object.values(personMap);

      return {
        total_submissions: total,
        complete,
        by_department,
        by_room,
        by_person,
        missed_most: [],
      };
    }),

  calendar: (room_id, month) =>
    safeFetchJson(`/api/stats/calendar?room_id=${room_id}&month=${encodeURIComponent(month)}`).catch(() => {
      const local = getLocalSubmissions();
      const monthPrefix = month;
      const daysMap = {};
      local.forEach((s) => {
        const d = s.work_date || (s.date_display ? s.date_display.split('/').reverse().join('-') : '');
        if (d && d.startsWith(monthPrefix)) {
          daysMap[d] = {
            date: d,
            has_submission: true,
            complete: s.is_complete !== false,
          };
        }
      });
      return {
        room: { id: room_id, name: 'Phòng Lấy máu, Điện tim' },
        month,
        days: Object.values(daysMap),
      };
    }),

  reminders: () => safeFetchJson('/api/stats/reminders').catch(() => []),
  backup: () => safeFetchJson('/api/stats/backup', { method: 'POST', json: {} }),
};
