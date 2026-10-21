import { useEffect, useState } from 'react';
import { admin, downloadAuth, stats } from '../api.js';

function todayISO() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
}
function monthStartISO() {
  return todayISO().slice(0, 7) + '-01';
}

export default function StatsPage() {
  const [from, setFrom] = useState(monthStartISO());
  const [to, setTo] = useState(todayISO());
  const [data, setData] = useState(null);
  const [rooms, setRooms] = useState([]);
  const [roomId, setRoomId] = useState('');
  const [month, setMonth] = useState(todayISO().slice(0, 7));
  const [cal, setCal] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    admin.rooms().then(setRooms).catch(() => {});
  }, []);

  useEffect(() => {
    stats
      .overview(from, to)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [from, to]);

  useEffect(() => {
    if (!roomId) {
      setCal(null);
      return;
    }
    stats
      .calendar(roomId, month)
      .then(setCal)
      .catch((e) => setError(e.message));
  }, [roomId, month]);

  return (
    <div className="page">
      <header className="page-header">
        <h1>Thống kê & lịch tháng</h1>
      </header>

      {error && <div className="alert error">{error}</div>}

      <section className="panel">
        <h2>Khoảng thống kê</h2>
        <div className="filter-grid">
          <label className="field">
            <span>Từ</span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="field">
            <span>Đến</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
        </div>
        {data && (
          <>
            <p>
              Tổng {data.total_submissions} bản · Đủ {data.complete} · Tỷ lệ{' '}
              {data.total_submissions
                ? Math.round((data.complete / data.total_submissions) * 100)
                : 0}
              %
            </p>
            <h3>Theo khoa</h3>
            {data.by_department.map((x) => (
              <div key={x.name} className="stat-row">
                <span>{x.name}</span>
                <span>
                  {x.complete}/{x.total} ({x.rate}%)
                </span>
              </div>
            ))}
            <h3>Theo phòng</h3>
            {data.by_room.map((x) => (
              <div key={x.name} className="stat-row">
                <span>{x.name}</span>
                <span>
                  {x.complete}/{x.total} ({x.rate}%)
                </span>
              </div>
            ))}
            <h3>Theo người</h3>
            {data.by_person.slice(0, 15).map((x) => (
              <div key={x.name} className="stat-row">
                <span>{x.name}</span>
                <span>
                  {x.complete}/{x.total}
                </span>
              </div>
            ))}
            <h3>Mục hay bỏ sót</h3>
            {data.missed_most.length === 0 && <p className="muted">Không có</p>}
            {data.missed_most.map((x) => (
              <div key={x.content} className="stat-row">
                <span>{x.content}</span>
                <span>{x.count} lần</span>
              </div>
            ))}
          </>
        )}
      </section>

      <section className="panel">
        <h2>Lịch tháng theo phòng</h2>
        <div className="filter-grid">
          <label className="field">
            <span>Phòng</span>
            <select value={roomId} onChange={(e) => setRoomId(e.target.value)}>
              <option value="">Chọn phòng</option>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.department_name} — {r.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Tháng</span>
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          </label>
        </div>
        {cal && (
          <>
            <p className="muted">
              Số ngày chưa điền trong tháng: <strong>{cal.empty_days}</strong>
            </p>
            <div className="cal-grid">
              {cal.days.map((d) => (
                <div key={d.date} className={`cal-day ${d.status}`} title={d.label}>
                  <div>{d.date.slice(-2)}</div>
                  <div>{d.label}</div>
                </div>
              ))}
            </div>
            <div className="row-actions" style={{ marginTop: 12 }}>
              <button
                type="button"
                className="btn primary"
                onClick={() =>
                  downloadAuth(
                    `/api/stats/rooms/${roomId}/month-pdf?month=${month}`,
                    `thang_${month}.pdf`
                  )
                }
              >
                Tải PDF tháng phòng
              </button>
            </div>
            <p className="hint">Xanh = đủ · Đỏ = thiếu · Xám = chưa điền</p>
          </>
        )}
      </section>
    </div>
  );
}
