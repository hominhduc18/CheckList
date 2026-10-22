import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

export default function QrViewModal({ room, onClose }) {
  if (!room) return null;

  const [qrDataUrl, setQrDataUrl] = useState('');
  const formUrl = `${window.location.origin}/r/${room.qr_code}`;

  useEffect(() => {
    QRCode.toDataURL(formUrl, {
      width: 320,
      margin: 2,
      color: {
        dark: '#0b5cab',
        light: '#ffffff',
      },
    })
      .then(setQrDataUrl)
      .catch((err) => {
        console.error('Lỗi sinh QR:', err);
        setQrDataUrl(`https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(formUrl)}&size=300x300`);
      });
  }, [formUrl]);

  const roomName = room.name || room.department_name || 'Khoa Khám bệnh';
  const deptName = room.department_name || 'Khoa Khám bệnh';
  const isSame = !room.name || room.name === deptName;

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal-dialog qr-preview-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#0b5cab' }}>Mã QR Kiểm Tra</h3>
            <p className="muted" style={{ margin: '2px 0 0', fontSize: '0.95rem' }}>
              {isSame ? (
                <strong style={{ color: '#0f172a' }}>{deptName}</strong>
              ) : (
                <>
                  {deptName} — <strong style={{ color: '#0f172a' }}>{roomName}</strong>
                </>
              )}
            </p>
          </div>
          <button type="button" className="btn-close" onClick={onClose} aria-label="Đóng">
            ✕
          </button>
        </div>

        <div className="qr-preview-body" style={{ textAlign: 'center', padding: '20px 16px' }}>
          <div
            className="qr-image-container"
            style={{
              display: 'inline-block',
              background: '#fff',
              padding: '12px',
              border: '2px solid #cbd5e1',
              borderRadius: '16px',
              boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
              minWidth: '240px',
              minHeight: '240px',
            }}
          >
            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt={`Mã QR ${roomName}`}
                style={{ width: '240px', height: '240px', display: 'block', objectFit: 'contain' }}
              />
            ) : (
              <div
                style={{
                  width: '240px',
                  height: '240px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#64748b',
                }}
              >
                Đang tạo mã QR…
              </div>
            )}
          </div>

          <div
            style={{
              marginTop: '16px',
              background: '#f8fafc',
              padding: '10px 12px',
              borderRadius: '10px',
              border: '1px solid #e2e8f0',
            }}
          >
            <span style={{ fontSize: '0.85rem', color: '#64748b', display: 'block' }}>Đường dẫn mở form:</span>
            <a
              href={formUrl}
              target="_blank"
              rel="noreferrer"
              style={{ fontSize: '0.92rem', fontWeight: '700', color: '#0b5cab', wordBreak: 'break-all' }}
            >
              {formUrl}
            </a>
          </div>

          <div
            className="qr-test-instruction"
            style={{
              marginTop: '14px',
              background: '#e8f3fc',
              padding: '12px',
              borderRadius: '12px',
              color: '#0b5cab',
              fontSize: '0.92rem',
              textAlign: 'left',
              lineHeight: '1.45',
            }}
          >
            <strong>💡 Cách test nhanh không cần in ra giấy:</strong>
            <ol style={{ margin: '6px 0 0', paddingLeft: '20px' }}>
              <li>Để nguyên cửa sổ này trên màn hình máy tính.</li>
              <li>Dùng điện thoại (Camera máy, Zalo, hoặc nút <em>Quét mã QR</em> trên app).</li>
              <li>Hướng camera điện thoại vào mã QR trên màn hình để quét và vào thẳng form!</li>
            </ol>
          </div>

          <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
            <a
              href={qrDataUrl || '#'}
              download={`QR_${roomName}.png`}
              className="btn ghost block"
              style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              📥 Tải ảnh PNG về máy
            </a>
            <a
              href={`/r/${room.qr_code}`}
              className="btn primary block"
              style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              Mở thẳng form trên máy này →
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
