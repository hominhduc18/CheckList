import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getRoomsList, getLocalSubmissions, clearLocalSubmissions, submitChecklist } from '../api.js';
import { useAuth } from '../auth.jsx';
import BrandHeader from '../BrandHeader.jsx';
import QrScannerModal from '../components/QrScannerModal.jsx';
import QrViewModal from '../components/QrViewModal.jsx';
import { flushOfflineQueue, listOffline } from '../offline.js';

export default function HomePage() {
  const { isLoggedIn, isAdmin } = useAuth();
  const navigate = useNavigate();

  const [rooms, setRooms] = useState([]);
  const [loadingRooms, setLoadingRooms] = useState(true);
  const [error, setError] = useState('');
  const [scannerOpen, setScannerOpen] = useState(false);
  const [previewQrRoom, setPreviewQrRoom] = useState(null);

  // Bộ lọc
  const [selectedDept, setSelectedDept] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Lịch sử thiết bị
  const [localHistory, setLocalHistory] = useState([]);

  // Offline queue
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    getRoomsList()
      .then((data) => {
        setRooms(data);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoadingRooms(false));

    // Lấy lịch sử thiết bị
    setLocalHistory(getLocalSubmissions());

    // Kiểm tra hàng đợi offline
    updatePendingCount();

    const onOnline = () => {
      handleSync();
    };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, []);

  async function updatePendingCount() {
    try {
      const list = await listOffline();
      setPendingCount(list.length);
    } catch {
      /* ignore */
    }
  }

  async function handleSync() {
    setIsSyncing(true);
    try {
      await flushOfflineQueue(submitChecklist);
      await updatePendingCount();
    } finally {
      setIsSyncing(false);
    }
  }

  function handleQrScanSuccess(qrCode) {
    setScannerOpen(false);
    navigate(`/r/${qrCode}`);
  }

  function handleClearHistory() {
    if (window.confirm('Xóa danh sách lịch sử đã gửi trên thiết bị này? (Dữ liệu trên máy chủ vẫn an toàn)')) {
      clearLocalSubmissions();
      setLocalHistory([]);
    }
  }

  // Danh sách các khoa duy nhất
  const departments = useMemo(() => {
    const map = new Map();
    rooms.forEach((r) => {
      if (r.department_name && !map.has(r.department_name)) {
        map.set(r.department_name, r.department_name);
      }
    });
    return Array.from(map.keys());
  }, [rooms]);

  // Lọc phòng theo khoa và ô tìm kiếm
  const filteredRooms = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return rooms.filter((r) => {
      const matchDept = selectedDept === 'ALL' || r.department_name === selectedDept;
      if (!matchDept) return false;
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        (r.department_name && r.department_name.toLowerCase().includes(q))
      );
    });
  }, [rooms, selectedDept, searchQuery]);

  return (
    <div className="page home-page">
      <BrandHeader />

      {/* Banner Offline Pending */}
      {pendingCount > 0 && (
        <div className="offline-alert-card">
          <div className="offline-alert-info">
            <span className="offline-badge-dot" />
            <div>
              <strong>Có {pendingCount} bản checklist đang lưu tạm (chờ gửi)</strong>
              <p>Hệ thống sẽ tự động gửi lên máy chủ khi thiết bị có kết nối mạng ổn định.</p>
            </div>
          </div>
          <button
            type="button"
            className="btn btn-sync"
            onClick={handleSync}
            disabled={isSyncing}
          >
            {isSyncing ? 'Đang gửi…' : 'Gửi ngay'}
          </button>
        </div>
      )}

      {/* Hero Section Quét QR cho Nhân Viên */}
      <section className="user-hero-card">
        <div className="hero-content">
          <span className="pill-badge">Dành cho Nhân viên y tế</span>
          <h1>Kiểm tra Checklist hằng ngày</h1>
          <p className="hero-desc">
            Quét mã QR tại phòng để mở phiếu kiểm tra tức thì — không cần tài khoản đăng nhập.
          </p>

          <div className="hero-actions" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <button
              type="button"
              className="btn btn-primary-hero"
              onClick={() => setScannerOpen(true)}
            >
              <span className="icon-camera" aria-hidden>📷</span>
              <span>QUÉT MÃ QR TẠI PHÒNG</span>
            </button>
            {rooms.length > 0 && (
              <button
                type="button"
                className="btn btn-secondary-hero"
                onClick={() => setPreviewQrRoom(rooms[0])}
                style={{
                  background: 'rgba(255, 255, 255, 0.15)',
                  border: '1.5px solid rgba(255, 255, 255, 0.4)',
                  color: '#ffffff',
                  borderRadius: '12px',
                  padding: '10px 16px',
                  fontWeight: '700',
                  fontSize: '0.92rem',
                  cursor: 'pointer',
                  backdropFilter: 'blur(4px)',
                }}
              >
                <span>👁 HIỆN MÃ QR LÊN MÀN HÌNH ĐỂ QUÉT THỬ</span>
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Lịch sử đã gửi trên thiết bị */}
      {localHistory.length > 0 && (
        <section className="card-block recent-submissions-block">
          <div className="block-header">
            <div>
              <h2>Phiếu bạn đã gửi gần đây</h2>
              <p className="muted">Lưu trên thiết bị này giúp bạn theo dõi ca trực hôm nay</p>
            </div>
            <button
              type="button"
              className="btn-text-danger"
              onClick={handleClearHistory}
              title="Xóa danh sách này"
            >
              Xóa lịch sử máy
            </button>
          </div>

          <div className="recent-grid">
            {localHistory.slice(0, 6).map((item, idx) => (
              <div key={item.id || idx} className="recent-card">
                <div className="recent-card-top">
                  <span className="dept-tag">{item.department_name}</span>
                  <span className={`status-pill ${item.is_complete ? 'ok' : 'missing'}`}>
                    {item.is_complete ? '✓ Đủ mục' : `Thiếu ${item.total_count - item.done_count} mục`}
                  </span>
                </div>
                <strong className="recent-room-name">{item.room_name}</strong>
                <div className="recent-meta">
                  <span>👤 {item.performer_name}</span>
                  <span>🕒 {item.time_display || item.date_display}</span>
                </div>
                {item.qr_code && (
                  <Link to={`/r/${item.qr_code}`} className="btn-link-action">
                    Điền tiếp phòng này →
                  </Link>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Khu vực Chọn Phòng Nhanh */}
      <section className="card-block rooms-block">
        <div className="block-header">
          <div>
            <h2>Danh sách phòng kiểm tra</h2>
            <p className="muted">Mở form trực tiếp khi không tiện quét mã QR</p>
          </div>
          <span className="room-count-badge">
            {filteredRooms.length} phòng
          </span>
        </div>

        {/* Thanh tìm kiếm */}
        <div className="search-bar-wrap">
          <span className="search-icon" aria-hidden>🔍</span>
          <input
            type="search"
            className="search-input"
            placeholder="Tìm theo tên phòng hoặc khoa (ví dụ: Phòng 01, Khám bệnh, Cấp cứu...)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              type="button"
              className="search-clear"
              onClick={() => setSearchQuery('')}
              aria-label="Xóa tìm kiếm"
            >
              ✕
            </button>
          )}
        </div>

        {/* Tabs chọn Khoa */}
        {departments.length > 1 && (
          <div className="dept-filter-tabs">
            <button
              type="button"
              className={`filter-chip ${selectedDept === 'ALL' ? 'active' : ''}`}
              onClick={() => setSelectedDept('ALL')}
            >
              Tất cả khoa ({rooms.length})
            </button>
            {departments.map((dept) => (
              <button
                key={dept}
                type="button"
                className={`filter-chip ${selectedDept === dept ? 'active' : ''}`}
                onClick={() => setSelectedDept(dept)}
              >
                {dept}
              </button>
            ))}
          </div>
        )}

        {/* Thông báo lỗi nếu có */}
        {error && <div className="alert error">{error}</div>}

        {/* Loading state */}
        {loadingRooms && (
          <div className="loading-state">
            <div className="spinner" />
            <p>Đang tải danh sách phòng…</p>
          </div>
        )}

        {/* Empty state */}
        {!loadingRooms && filteredRooms.length === 0 && !error && (
          <div className="empty-state">
            <p>Không tìm thấy phòng phù hợp với từ khóa &ldquo;{searchQuery}&rdquo;</p>
            <button
              type="button"
              className="btn ghost"
              onClick={() => {
                setSearchQuery('');
                setSelectedDept('ALL');
              }}
            >
              Xem tất cả các phòng
            </button>
          </div>
        )}

        {/* Danh sách phòng dạng Card Grid */}
        <div className="rooms-grid">
          {filteredRooms.map((r) => (
            <div key={r.id} className="room-card-item">
              <Link
                to={`/r/${r.qr_code}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  flex: 1,
                  textDecoration: 'none',
                  color: 'inherit',
                  minWidth: 0,
                }}
              >
                <div className="room-card-icon" aria-hidden>
                  🏥
                </div>
                <div className="room-card-info">
                  {r.department_name && r.department_name !== r.name && (
                    <span className="room-dept-name">{r.department_name}</span>
                  )}
                  <strong className="room-title">{r.name}</strong>
                </div>
              </Link>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                <button
                  type="button"
                  onClick={() => setPreviewQrRoom(r)}
                  title="Hiện mã QR lên màn hình để quét thử bằng điện thoại"
                  style={{
                    background: '#e8f3fc',
                    border: '1px solid #bfdbfe',
                    color: '#0b5cab',
                    padding: '6px 12px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                    fontWeight: '700',
                    fontFamily: 'inherit',
                    whiteSpace: 'nowrap',
                  }}
                >
                  👁 Xem QR
                </button>
                <Link
                  to={`/r/${r.qr_code}`}
                  className="room-arrow"
                  style={{ textDecoration: 'none', padding: '4px' }}
                  title="Mở form phòng này"
                >
                  →
                </Link>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Thông tin dành cho Quản lý / Admin */}
      <footer className="home-footer-info">
        {!isLoggedIn ? (
          <div className="manager-callout">
            <span>Bạn là Điều dưỡng trưởng / Quản lý khoa / Admin?</span>
            <Link to="/dang-nhap" className="btn btn-outline-sm">
              Đăng nhập quản lý
            </Link>
          </div>
        ) : (
          <div className="manager-logged-in-callout">
            <span>
              Đang đăng nhập: <strong>{isAdmin ? 'Quản trị viên' : 'Quản lý khoa'}</strong>
            </span>
            <Link to="/lich-su" className="btn-link">
              Xem lịch sử & xuất báo cáo Excel →
            </Link>
          </div>
        )}
      </footer>

      {/* Modal Quét QR bằng Camera */}
      <QrScannerModal
        isOpen={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={handleQrScanSuccess}
      />

      {/* Modal Hiển thị mã QR lên màn hình để quét test */}
      <QrViewModal
        room={previewQrRoom}
        onClose={() => setPreviewQrRoom(null)}
      />
    </div>
  );
}
