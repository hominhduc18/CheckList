import { useCallback, useEffect, useState } from 'react';
import {
  admin,
  downloadAuth,
  excelQuery,
  getFilterMeta,
  getSubmissions,
} from '../api.js';
import { exportSubmissionsListExcel } from '../exportExcel.js';
import BrandHeader from '../BrandHeader.jsx';

function todayISO() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
}
function daysAgoISO(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
}
function monthStartISO() {
  return todayISO().slice(0, 7) + '-01';
}

export default function HistoryPage() {
  const [meta, setMeta] = useState({ departments: [], rooms: [], templates: [] });
  const [items, setItems] = useState([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [from, setFrom] = useState(monthStartISO());
  const [to, setTo] = useState(todayISO());
  const [department, setDepartment] = useState('');
  const [roomId, setRoomId] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');

  useEffect(() => {
    getFilterMeta().then(setMeta).catch((e) => setError(e.message));
  }, []);

  const filters = useCallback(
    () => ({
      from,
      to,
      department,
      room_id: roomId,
      template_id: templateId,
      status,
      q,
    }),
    [from, to, department, roomId, templateId, status, q]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await getSubmissions(filters());
      setItems(res.items);
      setCount(res.count);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    load();
  }, [load]);

  function setPreset(kind) {
    if (kind === 'today') {
      setFrom(todayISO());
      setTo(todayISO());
    } else if (kind === '7d') {
      setFrom(daysAgoISO(6));
      setTo(todayISO());
    } else if (kind === 'month') {
      setFrom(monthStartISO());
      setTo(todayISO());
    }
  }

  function downloadExcel(preset) {
    try {
      const filename = `Checklist_${preset || from + '_den_' + to}.xlsx`;
      exportSubmissionsListExcel(items, filename);
    } catch (e) {
      setError(e.message);
    }
  }

  async function downloadCsv() {
    try {
      await downloadAuth(
        `/api/stats/export/csv?from=${from}&to=${to}`,
        'checklist.csv'
      );
    } catch (e) {
      setError(e.message);
    }
  }

  async function hideItem(id) {
    const reason = window.prompt('Lý do ẩn bản ghi (không xóa):');
    if (!reason) return;
    try {
      await admin.hideSubmission(id, reason);
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  const roomsFiltered = department
    ? meta.rooms.filter((r) => r.department_name === department)
    : meta.rooms;
  const templatesFiltered = roomId
    ? meta.templates.filter((t) => String(t.room_id) === String(roomId))
    : meta.templates;

  return (
    <div className="page">
      <header className="page-header">
        <h1>Lịch sử & xuất file</h1>
        <p className="muted">{count} bản ghi theo bộ lọc</p>
      </header>

      <section className="filters">
        <div className="preset-row">
          <button type="button" className="btn ghost" onClick={() => setPreset('today')}>
            Hôm nay
          </button>
          <button type="button" className="btn ghost" onClick={() => setPreset('7d')}>
            7 ngày
          </button>
          <button type="button" className="btn ghost" onClick={() => setPreset('month')}>
            Tháng này
          </button>
        </div>
        <div className="filter-grid">
          <label className="field">
            <span>Từ ngày</span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="field">
            <span>Đến ngày</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          <label className="field">
            <span>Khoa</span>
            <select
              value={department}
              onChange={(e) => {
                setDepartment(e.target.value);
                setRoomId('');
              }}
            >
              <option value="">Tất cả</option>
              {meta.departments.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Phòng</span>
            <select
              value={roomId}
              onChange={(e) => {
                setRoomId(e.target.value);
                setTemplateId('');
              }}
            >
              <option value="">Tất cả</option>
              {roomsFiltered.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Mẫu</span>
            <select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
              <option value="">Tất cả</option>
              {templatesFiltered.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Trạng thái</span>
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Tất cả</option>
              <option value="du">Đủ</option>
              <option value="thieu">Thiếu</option>
            </select>
          </label>
          <label className="field wide">
            <span>Tìm tên / ghi chú</span>
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
        </div>
      </section>

      <section className="export-bar">
        <h2>Tải Excel / CSV / PDF</h2>
        <div className="preset-row">
          <button type="button" className="btn primary" onClick={() => downloadExcel('today')}>
            Tải hôm nay
          </button>
          <button type="button" className="btn primary" onClick={() => downloadExcel('7d')}>
            Tải 7 ngày
          </button>
          <button type="button" className="btn primary" onClick={() => downloadExcel('month')}>
            Tải tháng này
          </button>
          <button type="button" className="btn" onClick={() => downloadExcel(null)}>
            Tải khoảng chọn
          </button>
          <button type="button" className="btn" onClick={downloadCsv}>
            Tải CSV
          </button>
        </div>
      </section>

      {error && <div className="alert error">{error}</div>}
      {loading && <p className="muted">Đang tải…</p>}

      <ul className="history-list">
        {items.map((item) => (
          <li key={item.id} className={`history-card ${item.is_complete ? 'ok' : 'bad'}`}>
            <div className="hc-top">
              <strong>{item.performer_name}</strong>
              <span className="time">
                {item.date_display} {item.time_display}
              </span>
            </div>
            <div className="hc-meta">
              {item.department_name} · {item.room_name} · {item.template_name}
              {item.is_supplement ? ' · Bản bổ sung' : ''}
            </div>
            <div className={`badge ${item.is_complete ? 'green' : 'red'}`}>
              {item.is_complete
                ? `Đủ ${item.done_count}/${item.total_count}`
                : `Thiếu ${item.total_count - item.done_count} mục`}
            </div>
            {!item.is_complete && item.missing_items?.length > 0 && (
              <ul className="missing">
                {item.missing_items.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            )}
            {item.note && <p className="note">Ghi chú: {item.note}</p>}
            <div className="row-actions">
              {item.photo_path && (
                <a href={`/${item.photo_path}`} target="_blank" rel="noreferrer" className="photo-link">
                  Ảnh
                </a>
              )}
              <button
                type="button"
                className="btn ghost"
                onClick={() =>
                  downloadAuth(`/api/stats/submissions/${item.id}/pdf`, `checklist_${item.id}.pdf`)
                }
              >
                PDF
              </button>
              <button type="button" className="btn danger" onClick={() => hideItem(item.id)}>
                Ẩn
              </button>
            </div>
          </li>
        ))}
      </ul>
      {!loading && items.length === 0 && (
        <p className="muted center">Không có bản ghi trong khoảng đã chọn.</p>
      )}
    </div>
  );
}
