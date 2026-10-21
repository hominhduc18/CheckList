import { Routes, Route, NavLink, Navigate } from 'react-router-dom';
import FillPage from './pages/FillPage.jsx';
import HistoryPage from './pages/HistoryPage.jsx';
import HomePage from './pages/HomePage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import AdminPage from './pages/AdminPage.jsx';
import StatsPage from './pages/StatsPage.jsx';
import { useAuth } from './auth.jsx';

function Private({ children, adminOnly = false }) {
  const { isLoggedIn, isAdmin } = useAuth();
  if (!isLoggedIn) return <Navigate to="/dang-nhap" replace />;
  if (adminOnly && !isAdmin) return <Navigate to="/lich-su" replace />;
  return children;
}

export default function App() {
  const { isLoggedIn, isAdmin, logout, user } = useAuth();

  return (
    <div className="app-shell">
      <main className="app-main">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/r/:qrCode" element={<FillPage />} />
          <Route path="/dang-nhap" element={<LoginPage />} />
          <Route
            path="/lich-su"
            element={
              <Private>
                <HistoryPage />
              </Private>
            }
          />
          <Route
            path="/thong-ke"
            element={
              <Private>
                <StatsPage />
              </Private>
            }
          />
          <Route
            path="/quan-tri"
            element={
              <Private>
                <AdminPage />
              </Private>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <nav className="tabbar" aria-label="Điều hướng chính">
        <NavLink to="/" end className={({ isActive }) => (isActive ? 'tab active' : 'tab')}>
          Trang chủ
        </NavLink>
        {isLoggedIn ? (
          <>
            <NavLink
              to="/lich-su"
              className={({ isActive }) => (isActive ? 'tab active' : 'tab')}
            >
              Lịch sử
            </NavLink>
            <NavLink
              to="/thong-ke"
              className={({ isActive }) => (isActive ? 'tab active' : 'tab')}
            >
              Thống kê
            </NavLink>
            <NavLink
              to="/quan-tri"
              className={({ isActive }) => (isActive ? 'tab active' : 'tab')}
            >
              {isAdmin ? 'Quản trị' : 'Phòng / QR'}
            </NavLink>
            <button
              type="button"
              className="tab"
              onClick={logout}
              title={user?.email}
              style={{ border: 0, background: 'transparent', cursor: 'pointer' }}
            >
              Thoát
            </button>
          </>
        ) : (
          <NavLink
            to="/dang-nhap"
            className={({ isActive }) => (isActive ? 'tab active' : 'tab')}
          >
            Đăng nhập
          </NavLink>
        )}
      </nav>
    </div>
  );
}
