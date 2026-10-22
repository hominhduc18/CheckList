import { getToken } from './auth.jsx';

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

async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: {
      ...authHeaders(options.json ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
    body: options.json ? JSON.stringify(options.json) : options.body,
  });
  if (!res.ok) throw new Error(await parseError(res));
  if (res.status === 204) return null;
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) return res.json();
  return res;
}

export async function login(email, password) {
  return api('/api/auth/login', { method: 'POST', json: { email, password } });
}

export async function getMe() {
  return api('/api/auth/me');
}

export async function getRoomByQr(qrCode) {
  const res = await fetch(`/api/rooms/${encodeURIComponent(qrCode)}`);
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function getRoomTodayStatus(qrCode) {
  try {
    const res = await fetch(`/api/rooms/${encodeURIComponent(qrCode)}/today-status`);
    if (!res.ok) return { submissions: [] };
    return res.json();
  } catch {
    return { submissions: [] };
  }
}

export async function getNameSuggestions(roomId, q = '') {
  const url = `/api/rooms/${roomId}/name-suggestions?q=${encodeURIComponent(q)}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  return res.json();
}

export async function checkDuplicate({ template_id, work_date, shift }) {
  const qs = new URLSearchParams({ template_id, work_date, shift });
  const res = await fetch(`/api/submissions/check-duplicate?${qs}`);
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function submitChecklist(formData) {
  const res = await fetch('/api/submissions', { method: 'POST', body: formData });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function submitBatchChecklist(formData) {
  const res = await fetch('/api/submissions/batch', { method: 'POST', body: formData });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
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
  return api('/api/meta/filters');
}

export async function getSubmissions(params) {
  const qs = new URLSearchParams();
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') qs.set(k, v);
  });
  return api(`/api/submissions?${qs}`);
}

export async function getRoomsList() {
  const res = await fetch('/api/rooms-list');
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export function excelQuery(params) {
  const qs = new URLSearchParams();
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') qs.set(k, v);
  });
  return `/api/export/excel?${qs}`;
}

/** Tải file có kèm token đăng nhập */
export async function downloadAuth(url, fallbackName = 'download') {
  const res = await fetch(url, { headers: authHeaders() });
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

/* ---- Admin ---- */
export const admin = {
  departments: () => api('/api/admin/departments'),
  createDept: (name) => api('/api/admin/departments', { method: 'POST', json: { name } }),
  updateDept: (id, body) => api(`/api/admin/departments/${id}`, { method: 'PUT', json: body }),
  rooms: () => api('/api/admin/rooms'),
  createRoom: (body) => api('/api/admin/rooms', { method: 'POST', json: body }),
  updateRoom: (id, body) => api(`/api/admin/rooms/${id}`, { method: 'PUT', json: body }),
  rotateQr: (id) => api(`/api/admin/rooms/${id}/rotate-code`, { method: 'POST', json: {} }),
  templates: () => api('/api/admin/templates'),
  createTemplate: (body) => api('/api/admin/templates', { method: 'POST', json: body }),
  updateTemplate: (id, body) => api(`/api/admin/templates/${id}`, { method: 'PUT', json: body }),
  cloneTemplate: (id) => api(`/api/admin/templates/${id}/clone`, { method: 'POST', json: {} }),
  deleteTemplate: (id) => api(`/api/admin/templates/${id}?confirm=DELETE`, { method: 'DELETE' }),
  managers: () => api('/api/admin/managers'),
  createManager: (body) => api('/api/admin/managers', { method: 'POST', json: body }),
  updateManager: (id, body) => api(`/api/admin/managers/${id}`, { method: 'PUT', json: body }),
  audit: () => api('/api/admin/audit-log'),
  settings: () => api('/api/admin/settings'),
  saveSettings: (body) => api('/api/admin/settings', { method: 'PUT', json: body }),
  hideSubmission: (id, reason) =>
    api(`/api/admin/submissions/${id}/hide`, { method: 'POST', json: { reason } }),
};

export const stats = {
  overview: (from, to) => api(`/api/stats/overview?from=${from}&to=${to}`),
  calendar: (room_id, month) =>
    api(`/api/stats/calendar?room_id=${room_id}&month=${encodeURIComponent(month)}`),
  reminders: () => api('/api/stats/reminders'),
  backup: () => api('/api/stats/backup', { method: 'POST', json: {} }),
};
