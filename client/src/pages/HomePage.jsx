import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getRoomsList } from '../api.js';
import { useAuth } from '../auth.jsx';
import BrandHeader from '../BrandHeader.jsx';

export default function HomePage() {
  const { isLoggedIn, isAdmin } = useAuth();
  const [rooms, setRooms] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    getRoomsList()
      .then(setRooms)
      .catch((e) => setError(e.message));
  }, []);

  return (
    <div className="page">
      <BrandHeader />

      <header className="page-header">
        <h1>Checklist hằng ngày</h1>
        <p className="muted">
          Nhân viên quét mã QR tại phòng để điền — không cần tài khoản. Quản lý đăng nhập để xem
          lịch sử và tải Excel.
        </p>
      </header>

      {!isLoggedIn && (
        <div className="alert info">
          Quản lý / Admin: <Link to="/dang-nhap">Đăng nhập tại đây</Link>
        </div>
      )}

      {error && <div className="alert error">{error}</div>}

      <section className="card-block">
        <h2>Phòng (mở form nhanh)</h2>
        {rooms.length === 0 && !error && <p className="muted">Đang tải…</p>}
        <ul className="room-list">
          {rooms.map((r) => (
            <li key={r.id}>
              <Link to={`/r/${r.qr_code}`} className="room-link">
                <strong>{r.department_name}</strong>
                <span>{r.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {isLoggedIn && (
        <p className="hint">
          {isAdmin
            ? 'Bạn đang đăng nhập Admin — vào tab Quản trị để sửa khoa/phòng/mẫu/QR.'
            : 'Bạn đang đăng nhập quản lý khoa — chỉ xem dữ liệu khoa được gán.'}
        </p>
      )}
    </div>
  );
}
