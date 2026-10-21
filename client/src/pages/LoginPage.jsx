import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { login } from '../api.js';
import { useAuth } from '../auth.jsx';
import BrandHeader from '../BrandHeader.jsx';

export default function LoginPage() {
  const { isLoggedIn, loginSuccess } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState('admin@bv.local');
  const [password, setPassword] = useState('Admin@123');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (isLoggedIn) return <Navigate to="/lich-su" replace />;

  async function onSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const data = await login(email, password);
      loginSuccess(data);
      nav('/lich-su');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page">
      <BrandHeader />
      <div className="login-box">
        <h1>Đăng nhập quản lý</h1>
        <p className="muted">Nhân viên điền checklist không cần đăng nhập — chỉ quét QR.</p>
        <form onSubmit={onSubmit}>
          <label className="field">
            <span>Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label className="field">
            <span>Mật khẩu</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          {error && <div className="alert error">{error}</div>}
          <button type="submit" className="btn primary block" disabled={loading}>
            {loading ? 'Đang đăng nhập…' : 'Đăng nhập'}
          </button>
        </form>
        <p className="hint">
          Demo: admin@bv.local / Admin@123
          <br />
          Quản lý khoa: khoa.kham@bv.local / Manager@123
        </p>
      </div>
    </div>
  );
}
