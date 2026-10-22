import { Link, useLocation } from 'react-router-dom';

/** Banner thương hiệu BV QT Chấn thương Chỉnh hình Sài Gòn */
export default function BrandHeader({ compact = false }) {
  const location = useLocation();
  const isScanPage = location.pathname.startsWith('/r/');

  return (
    <header className={`brand-bar ${compact ? 'compact' : ''}`}>
      {isScanPage ? (
        <div className="brand-logos" aria-label="Logo Bệnh viện">
          <img src="/brand/logo-ito.png" alt="SAI GON - ITO" className="brand-logo" />
          <img
            src="/brand/badge-aaci.png"
            alt="AACI Accreditation"
            className="brand-badge"
          />
        </div>
      ) : (
        <Link to="/" className="brand-logos" aria-label="Trang chủ">
          <img src="/brand/logo-ito.png" alt="SAI GON - ITO" className="brand-logo" />
          <img
            src="/brand/badge-aaci.png"
            alt="AACI Accreditation"
            className="brand-badge"
          />
        </Link>
      )}
      <div className="brand-text">
        <p className="brand-name">
          BỆNH VIỆN QUỐC TẾ CHẤN THƯƠNG CHỈNH HÌNH SÀI GÒN
        </p>
        {!compact && <p className="brand-sub">Checklist kiểm tra hằng ngày</p>}
      </div>
    </header>
  );
}
