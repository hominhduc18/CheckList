import { useEffect, useRef, useState } from 'react';

/**
 * Trích xuất mã phòng từ nội dung QR (có thể là URL đầy đủ hoặc chỉ mã)
 */
export function extractQrCode(raw) {
  if (!raw) return '';
  const text = String(raw).trim();
  const match = text.match(/\/r\/([a-zA-Z0-9_-]+)/);
  if (match) return match[1];
  // Nếu là chuỗi không có khoảng trắng
  if (/^[a-zA-Z0-9_-]{4,64}$/.test(text)) return text;
  return text;
}

export default function QrScannerModal({ isOpen, onClose, onScan }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [error, setError] = useState('');
  const [manualCode, setManualCode] = useState('');
  const [hasCamera, setHasCamera] = useState(true);
  const [torchOn, setTorchOn] = useState(false);
  const [canTorch, setCanTorch] = useState(false);
  const [hasDetector, setHasDetector] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      return;
    }
    setError('');
    startCamera();

    return () => {
      stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }

  async function startCamera() {
    stopCamera();
    setError('');

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setHasCamera(false);
      setError('Trình duyệt không hỗ trợ truy cập camera trực tiếp. Vui lòng tải ảnh QR hoặc nhập mã bên dưới.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }

      // Kiểm tra Torch
      const track = stream.getVideoTracks()[0];
      const capabilities = track?.getCapabilities ? track.getCapabilities() : {};
      if (capabilities.torch) {
        setCanTorch(true);
      }

      // Bắt đầu nhận diện mã
      initDetector();
    } catch (err) {
      console.warn('Camera error:', err);
      setHasCamera(false);
      setError('Không thể mở camera (chưa cấp quyền hoặc camera đang bận). Vui lòng tải ảnh QR hoặc chọn phòng từ danh sách.');
    }
  }

  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0];
    if (track && canTorch) {
      const next = !torchOn;
      try {
        await track.applyConstraints({ advanced: [{ torch: next }] });
        setTorchOn(next);
      } catch {
        /* ignore */
      }
    }
  }

  async function initDetector() {
    if ('BarcodeDetector' in window) {
      try {
        const formats = await window.BarcodeDetector.getSupportedFormats();
        if (formats.includes('qr_code')) {
          setHasDetector(true);
          const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
          scanLoop(detector);
          return;
        }
      } catch {
        /* ignore */
      }
    }
    // Không có BarcodeDetector native
    setHasDetector(false);
  }

  function handleDetected(rawText) {
    const code = extractQrCode(rawText);
    if (code) {
      if (navigator.vibrate) {
        try {
          navigator.vibrate(80);
        } catch {
          /* ignore */
        }
      }
      stopCamera();
      onScan(code);
    }
  }

  function scanLoop(detector) {
    let active = true;

    async function check() {
      if (!active || !streamRef.current || !videoRef.current) return;
      if (videoRef.current.readyState >= 2) {
        try {
          const barcodes = await detector.detect(videoRef.current);
          if (barcodes && barcodes.length > 0) {
            const raw = barcodes[0].rawValue;
            if (raw) {
              active = false;
              handleDetected(raw);
              return;
            }
          }
        } catch {
          /* ignore detection errors */
        }
      }
      if (active) {
        requestAnimationFrame(check);
      }
    }

    requestAnimationFrame(check);
  }

  // Quét từ ảnh người dùng tải lên
  async function handleFileScan(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    if ('BarcodeDetector' in window) {
      try {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = async () => {
          try {
            const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
            const barcodes = await detector.detect(img);
            URL.revokeObjectURL(url);
            if (barcodes.length > 0 && barcodes[0].rawValue) {
              handleDetected(barcodes[0].rawValue);
            } else {
              setError('Không tìm thấy mã QR trong ảnh. Vui lòng thử ảnh rõ nét hơn.');
            }
          } catch {
            URL.revokeObjectURL(url);
            setError('Lỗi khi đọc mã từ ảnh.');
          }
        };
        img.src = url;
        return;
      } catch {
        /* fallback */
      }
    }
    setError('Trình duyệt chưa hỗ trợ quét trực tiếp từ ảnh. Vui lòng nhập mã phòng bên dưới.');
  }

  function handleManualSubmit(e) {
    e.preventDefault();
    const code = extractQrCode(manualCode);
    if (!code) {
      setError('Vui lòng nhập mã phòng.');
      return;
    }
    stopCamera();
    onScan(code);
  }

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal-dialog qr-scanner-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h3>Quét mã QR tại phòng</h3>
            <p className="muted" style={{ margin: 0, fontSize: '0.85rem' }}>
              Hướng camera về phía mã QR dán tại cửa phòng
            </p>
          </div>
          <button type="button" className="btn-close" onClick={onClose} aria-label="Đóng">
            ✕
          </button>
        </div>

        <div className="scanner-body">
          {hasCamera ? (
            <div className="scanner-viewport">
              <video ref={videoRef} playsInline autoPlay muted className="scanner-video" />
              <div className="scanner-overlay">
                <div className="scanner-target">
                  <div className="corner tl" />
                  <div className="corner tr" />
                  <div className="corner bl" />
                  <div className="corner br" />
                  <div className="scanner-laser" />
                </div>
              </div>

              {canTorch && (
                <button
                  type="button"
                  className={`btn-torch ${torchOn ? 'on' : ''}`}
                  onClick={toggleTorch}
                  title="Bật/Tắt đèn pin"
                >
                  {torchOn ? '🔦 Tắt đèn' : '💡 Bật đèn'}
                </button>
              )}
            </div>
          ) : (
            <div className="scanner-placeholder">
              <div className="scanner-icon">📷</div>
              <p>Camera không khả dụng</p>
            </div>
          )}

          {error && <div className="alert error" style={{ margin: '12px 0' }}>{error}</div>}

          {!hasDetector && hasCamera && (
            <p className="scanner-tip" style={{ fontSize: '0.82rem', color: '#64748b', textAlign: 'center', margin: '8px 0' }}>
              Mẹo: Giữ điện thoại cố định cách mã QR khoảng 20-30 cm để nhận diện tốt nhất.
            </p>
          )}

          <div className="scanner-options">
            <label className="btn ghost block file-pick-btn" style={{ cursor: 'pointer' }}>
              <span>📁 Tải ảnh mã QR từ thư viện máy</span>
              <input type="file" accept="image/*" onChange={handleFileScan} style={{ display: 'none' }} />
            </label>

            <form onSubmit={handleManualSubmit} className="manual-input-box">
              <input
                type="text"
                placeholder="Hoặc nhập mã phòng (vd: e7K4...)"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
              />
              <button type="submit" className="btn primary">
                Mở
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
