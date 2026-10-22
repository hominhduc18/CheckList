import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  getDeviceId,
  getNameSuggestions,
  getRememberedName,
  getRoomByQr,
  getRoomTodayStatus,
  rememberName,
  saveLocalSubmission,
  submitBatchChecklist,
  submitChecklist,
} from '../api.js';
import { enqueueOffline, flushOfflineQueue, listOffline } from '../offline.js';
import BrandHeader from '../BrandHeader.jsx';
import PaperChecklistTable from '../components/PaperChecklistTable.jsx';
import { exportSingleSubmissionExcel } from '../exportExcel.js';

function compressImage(file, maxBytes = 5 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('File không phải ảnh'));
      return;
    }
    if (file.size <= maxBytes && file.size < 800 * 1024) {
      resolve(file);
      return;
    }
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let { width, height } = img;
      const maxSide = 1600;
      if (width > maxSide || height > maxSide) {
        const ratio = Math.min(maxSide / width, maxSide / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('Không nén được ảnh'));
            return;
          }
          if (blob.size > maxBytes) {
            reject(new Error('Ảnh vẫn lớn hơn 5 MB sau khi nén'));
            return;
          }
          resolve(new File([blob], 'anh_checklist.jpg', { type: 'image/jpeg' }));
        },
        'image/jpeg',
        0.75
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Không đọc được ảnh'));
    };
    img.src = url;
  });
}

const COMMON_REASONS = [
  'Đang bảo trì / sửa chữa',
  'Thiếu vật tư, chờ bổ sung',
  'Chưa đến giờ thực hiện ca',
  'Đang có ca cấp cứu ưu tiên',
  'Máy đang bận phục vụ bệnh nhân',
];

export default function FillPage() {
  const { qrCode } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);
  const [todaySubmissions, setTodaySubmissions] = useState([]);

  // BƯỚC: 'SELECT_TEMPLATES' (chọn form) hoặc 'FILL_FORM' (điền báo cáo)
  const [currentStep, setCurrentStep] = useState('SELECT_TEMPLATES');

  // Danh sách ID các mẫu form được chọn (cho phép chọn nhiều mẫu)
  const [selectedTemplateIds, setSelectedTemplateIds] = useState([]);

  // Ticks lưu theo dạng: { [templateId]: { [itemId]: boolean } }
  const [ticksByTemplate, setTicksByTemplate] = useState({});

  const [name, setName] = useState(getRememberedName());
  const [suggestions, setSuggestions] = useState([]);
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState(null);
  const [photoPreview, setPhotoPreview] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [successResult, setSuccessResult] = useState(null);
  const [clock, setClock] = useState('');
  const [online, setOnline] = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await getRoomByQr(qrCode);
      setData(res);

      if (res.templates?.length) {
        // Khởi tạo tick map cho tất cả các mẫu
        const initialTicks = {};
        res.templates.forEach((tpl) => {
          initialTicks[tpl.id] = {};
          tpl.items.forEach((it) => {
            initialTicks[tpl.id][String(it.id)] = false;
          });
        });
        setTicksByTemplate(initialTicks);

        // Mặc định chọn tất cả các mẫu form có trong phòng để nhân viên dễ tick
        setSelectedTemplateIds(res.templates.map((t) => t.id));
      }

      // Tải lịch sử hôm nay của phòng
      getRoomTodayStatus(qrCode).then((status) => {
        if (status?.submissions) {
          setTodaySubmissions(status.submissions);
        }
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [qrCode]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const syncPending = () => listOffline().then((x) => setPendingCount(x.length));
    syncPending();
    const onOnline = () => {
      setOnline(true);
      flushOfflineQueue(submitChecklist).then(syncPending);
    };
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    if (navigator.onLine) onOnline();
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  // Khóa nhân viên quét QR không cho thoát về trang chủ
  useEffect(() => {
    window.history.pushState(null, '', window.location.href);
    const onPopState = () => {
      window.history.pushState(null, '', window.location.href);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // Đồng hồ thời gian thực
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setClock(
        now.toLocaleString('vi-VN', {
          timeZone: 'Asia/Ho_Chi_Minh',
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      );
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // Gợi ý tên
  useEffect(() => {
    if (!data?.room?.id) return;
    const t = setTimeout(() => {
      getNameSuggestions(data.room.id, name).then(setSuggestions);
    }, 200);
    return () => clearTimeout(t);
  }, [name, data?.room?.id]);

  // Danh sách các mẫu đã được chọn
  const activeTemplates = useMemo(() => {
    if (!data?.templates) return [];
    return data.templates.filter((t) => selectedTemplateIds.includes(t.id));
  }, [data, selectedTemplateIds]);

  // Tính tổng số mục và số mục đã tick trên tất cả các mẫu được chọn
  const { totalItemsCount, totalDoneCount, missingItemsCount } = useMemo(() => {
    let total = 0;
    let done = 0;
    activeTemplates.forEach((tpl) => {
      const tplTicks = ticksByTemplate[tpl.id] || {};
      tpl.items.forEach((it) => {
        total += 1;
        if (tplTicks[String(it.id)]) done += 1;
      });
    });
    return {
      totalItemsCount: total,
      totalDoneCount: done,
      missingItemsCount: total - done,
    };
  }, [activeTemplates, ticksByTemplate]);

  const progressPercent = totalItemsCount > 0 ? Math.round((totalDoneCount / totalItemsCount) * 100) : 0;

  // Xử lý toggle chọn mẫu form
  function toggleTemplateSelect(tplId) {
    setSelectedTemplateIds((prev) => {
      if (prev.includes(tplId)) {
        return prev.filter((id) => id !== tplId);
      } else {
        return [...prev, tplId];
      }
    });
  }

  function selectAllTemplates() {
    if (!data?.templates) return;
    setSelectedTemplateIds(data.templates.map((t) => t.id));
  }

  function deselectAllTemplates() {
    setSelectedTemplateIds([]);
  }

  // Chuyển sang bước điền form
  function handleProceedToFill() {
    if (selectedTemplateIds.length === 0) {
      setError('Vui lòng chọn ít nhất 1 loại form để báo cáo.');
      return;
    }
    setError('');
    setCurrentStep('FILL_FORM');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Toggle tick một mục
  function toggleItem(templateId, itemId) {
    if (navigator.vibrate) {
      try {
        navigator.vibrate(20);
      } catch {
        /* ignore */
      }
    }
    setTicksByTemplate((prev) => {
      const currentTplTicks = prev[templateId] || {};
      return {
        ...prev,
        [templateId]: {
          ...currentTplTicks,
          [String(itemId)]: !currentTplTicks[String(itemId)],
        },
      };
    });
  }

  // Tick tất cả các mục của một mẫu cụ thể
  function tickAllInTemplate(templateId) {
    const tpl = data?.templates?.find((t) => t.id === templateId);
    if (!tpl) return;
    setTicksByTemplate((prev) => {
      const nextTplTicks = { ...(prev[templateId] || {}) };
      tpl.items.forEach((it) => {
        nextTplTicks[String(it.id)] = true;
      });
      return { ...prev, [templateId]: nextTplTicks };
    });
  }

  // Tick tất cả mục trên TẤT CẢ các mẫu đang chọn
  function tickAllActiveTemplates() {
    setTicksByTemplate((prev) => {
      const next = { ...prev };
      activeTemplates.forEach((tpl) => {
        next[tpl.id] = { ...(next[tpl.id] || {}) };
        tpl.items.forEach((it) => {
          next[tpl.id][String(it.id)] = true;
        });
      });
      return next;
    });
  }

  // Bỏ chọn tất cả mục
  function untickAllActiveTemplates() {
    setTicksByTemplate((prev) => {
      const next = { ...prev };
      activeTemplates.forEach((tpl) => {
        next[tpl.id] = { ...(next[tpl.id] || {}) };
        tpl.items.forEach((it) => {
          next[tpl.id][String(it.id)] = false;
        });
      });
      return next;
    });
  }

  function addQuickReason(reason) {
    setNote((prev) => {
      const clean = prev.trim();
      if (!clean) return reason;
      if (clean.includes(reason)) return clean;
      return `${clean}; ${reason}`;
    });
  }

  async function onPhotoChange(e) {
    const file = e.target.files?.[0];
    if (!file) {
      setPhoto(null);
      setPhotoPreview('');
      return;
    }
    try {
      const compressed = await compressImage(file);
      setPhoto(compressed);
      setPhotoPreview(URL.createObjectURL(compressed));
    } catch (err) {
      setError(err.message);
      e.target.value = '';
      setPhoto(null);
      setPhotoPreview('');
    }
  }

  function removePhoto() {
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhoto(null);
    setPhotoPreview('');
  }

  // Xử lý Gửi Báo Cáo cho tất cả các mẫu đã chọn
  async function handleSubmit(e) {
    e.preventDefault();
    if (!data || activeTemplates.length === 0) return;
    setError('');

    const trimmedName = name.trim();
    if (!trimmedName || trimmedName.length < 2) {
      setError('Vui lòng nhập họ và tên người thực hiện (ít nhất 2 ký tự).');
      return;
    }
    if (missingItemsCount > 0 && !note.trim()) {
      setError(`Còn ${missingItemsCount} mục chưa tick — bắt buộc ghi lý do vào ô Ghi chú.`);
      return;
    }

    setSubmitting(true);
    try {
      const templatesPayload = activeTemplates.map((tpl) => ({
        template_id: tpl.id,
        template_name: tpl.name,
        tick_results: ticksByTemplate[tpl.id] || {},
        is_supplement: false,
      }));

      // Nếu đang ngoại tuyến -> Lưu vào hàng đợi IndexedDB
      if (!navigator.onLine) {
        for (const tpl of activeTemplates) {
          const fields = {
            room_id: String(data.room.id),
            template_id: String(tpl.id),
            performer_name: trimmedName,
            note: note.trim(),
            tick_results: JSON.stringify(ticksByTemplate[tpl.id] || {}),
            device_id: getDeviceId(),
            client_time: new Date().toISOString(),
            is_supplement: '0',
          };
          await enqueueOffline({ fields, photoBlob: photo || null });
        }
        rememberName(trimmedName);
        setPendingCount((await listOffline()).length);

        const offlineResult = {
          offline: true,
          room_name: data.room.name,
          department_name: data.room.department_name,
          qr_code: qrCode,
          performer_name: trimmedName,
          date_display: new Date().toLocaleDateString('vi-VN'),
          time_display: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
          note: note.trim(),
          photoPreview,
          templates: activeTemplates.map((tpl) => {
            const tplTicks = ticksByTemplate[tpl.id] || {};
            const done = tpl.items.filter((it) => tplTicks[String(it.id)]).length;
            return {
              id: tpl.id,
              template_name: tpl.name,
              done_count: done,
              total_count: tpl.items.length,
              is_complete: done === tpl.items.length,
            };
          }),
        };
        saveLocalSubmission({
          id: `off_${Date.now()}`,
          ...offlineResult,
          is_complete: missingItemsCount === 0,
          done_count: totalDoneCount,
          total_count: totalItemsCount,
        });
        setSuccessResult(offlineResult);
        return;
      }

      // Khi trực tuyến -> Gửi batch lên server
      const fd = new FormData();
      fd.append('room_id', String(data.room.id));
      fd.append('performer_name', trimmedName);
      fd.append('note', note.trim());
      fd.append('device_id', getDeviceId());
      fd.append('client_time', new Date().toISOString());
      fd.append('templates_data', JSON.stringify(templatesPayload));
      if (photo) fd.append('photo', photo);

      const res = await submitBatchChecklist(fd);
      rememberName(trimmedName);

      const fullResult = {
        offline: false,
        room_name: data.room.name,
        department_name: data.room.department_name,
        qr_code: qrCode,
        performer_name: trimmedName,
        date_display: new Date().toLocaleDateString('vi-VN'),
        time_display: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
        note: note.trim(),
        photoPreview,
        templates: res.submissions || [],
      };

      // Lưu tóm tắt vào lịch sử cục bộ
      saveLocalSubmission({
        id: res.submissions?.[0]?.id || Date.now(),
        room_name: data.room.name,
        department_name: data.room.department_name,
        qr_code: qrCode,
        performer_name: trimmedName,
        date_display: fullResult.date_display,
        time_display: fullResult.time_display,
        is_complete: missingItemsCount === 0,
        done_count: totalDoneCount,
        total_count: totalItemsCount,
      });

      setSuccessResult(fullResult);
    } catch (err) {
      setError(err.message || 'Lỗi gửi dữ liệu báo cáo');
    } finally {
      setSubmitting(false);
    }
  }

  function handleReset() {
    setSuccessResult(null);
    setNote('');
    removePhoto();
    setCurrentStep('SELECT_TEMPLATES');
    load();
  }

  if (loading) {
    return (
      <div className="page fill-page">
        <BrandHeader compact />
        <div className="loading-state">
          <div className="spinner" />
          <p>Đang tải danh sách form checklist…</p>
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="page fill-page">
        <BrandHeader compact />
        <div className="error-card">
          <div className="error-icon" aria-hidden>⚠</div>
          <h2>Không thể tải thông tin phòng</h2>
          <p className="alert error">{error}</p>
          <div className="actions">
            <button type="button" className="btn primary" onClick={load}>
              Thử tải lại
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ========================================================
  // MÀN HÌNH HOÀN THÀNH (SUCCESS SCREEN)
  // ========================================================
  if (successResult) {
    return (
      <div className="page fill-page">
        <BrandHeader compact />

        <div className="success-certificate-card">
          <div className="cert-top-badge">
            <div className="success-pulse-icon">✓</div>
            <h2>{successResult.offline ? 'Đã lưu tạm — Chờ gửi' : 'Đã gửi báo cáo thành công'}</h2>
            <p className="cert-subtitle">
              {successResult.offline
                ? 'Đã lưu an toàn vào bộ nhớ máy, sẽ tự động gửi khi có kết nối mạng.'
                : 'Báo cáo đã được ghi nhận đầy đủ trên hệ thống máy chủ bệnh viện.'}
            </p>
          </div>

          <div className="cert-details-box">
            <div className="detail-row">
              <span className="label">Khoa / Phòng:</span>
              <strong className="value">
                {data.room.department_name} — {data.room.name}
              </strong>
            </div>

            <div className="detail-row">
              <span className="label">Người thực hiện:</span>
              <strong className="value">{successResult.performer_name}</strong>
            </div>

            <div className="detail-row">
              <span className="label">Thời gian ghi nhận:</span>
              <span className="value">
                {successResult.time_display} · {successResult.date_display}
              </span>
            </div>

            <div className="detail-row column">
              <span className="label">Các mẫu form đã báo cáo ({successResult.templates?.length || 0} mẫu):</span>
              <div className="cert-templates-summary">
                {successResult.templates?.map((t) => (
                  <div key={t.id || t.template_id} className="cert-tpl-badge">
                    <strong>{t.template_name}</strong>
                    <span className={`status-pill ${t.is_complete ? 'ok' : 'missing'}`}>
                      {t.is_complete
                        ? `✓ Đủ ${t.done_count}/${t.total_count} mục`
                        : `Thiếu ${t.total_count - t.done_count} mục`}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {successResult.note && (
              <div className="detail-row column">
                <span className="label">Ghi chú đã gửi:</span>
                <p className="note-text-box">{successResult.note}</p>
              </div>
            )}

            {successResult.photoPreview && (
              <div className="detail-row column">
                <span className="label">Ảnh đính kèm:</span>
                <img
                  src={successResult.photoPreview}
                  alt="Ảnh kiểm tra"
                  className="cert-photo-preview"
                />
              </div>
            )}
          </div>

          {/* Bảng theo dõi checklist giấy của viện */}
          <PaperChecklistTable newEntry={successResult} />

          <div className="cert-actions">
            <button
              type="button"
              className="btn block"
              onClick={() => exportSingleSubmissionExcel(successResult, data)}
              style={{
                background: '#16a34a',
                color: '#ffffff',
                border: 'none',
                fontWeight: 'bold',
                fontSize: '1rem',
                padding: '12px',
                borderRadius: '10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                boxShadow: '0 4px 12px rgba(22, 163, 74, 0.25)',
                cursor: 'pointer',
              }}
            >
              <span aria-hidden>📊</span>
              <span>TẢI FILE EXCEL BIÊN BẢN NÀY (.XLSX)</span>
            </button>
            <button
              type="button"
              className="btn btn-print-cert block"
              onClick={() => window.print()}
            >
              🖨 In / Lưu phiếu xác nhận (PDF)
            </button>
            <button type="button" className="btn primary block" onClick={handleReset}>
              ✓ Đã hoàn thành nhiệm vụ (hoặc làm tiếp mẫu khác)
            </button>
          </div>
        </div>
      </div>
    );
  }

  const shiftName =
    data.shift === 'sang'
      ? 'Ca sáng'
      : data.shift === 'chieu'
      ? 'Ca chiều'
      : 'Ca ngày';

  // ========================================================
  // BƯỚC 1: MÀN HÌNH CHỌN LOẠI FORM / BẢNG KIỂM (TEMPLATE SELECTOR)
  // ========================================================
  if (currentStep === 'SELECT_TEMPLATES') {
    return (
      <div className="page fill-page">
        {/* Thanh điều hướng trên cùng */}
        <div className="fill-top-nav">
          <div className="staff-lock-badge" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.9rem', color: '#0b5cab', fontWeight: '700', padding: '4px 10px', background: '#e8f3fc', borderRadius: '8px' }}>
            <span aria-hidden>🔒</span>
            <span>Chế độ kiểm tra theo mã QR</span>
          </div>
          <div className="network-status-indicator">
            <span className={`dot ${online ? 'online' : 'offline'}`} />
            <span>{online ? 'Trực tuyến' : 'Ngoại tuyến'}</span>
            {pendingCount > 0 && <span className="pending-pill">{pendingCount} chờ gửi</span>}
          </div>
        </div>

        {/* Header thông tin phòng */}
        <header className="fill-header">
          <div className="dept-badge">{data.room.department_name}</div>
          <h1 className="room-title">{data.room.name}</h1>
          <div className="meta-bar">
            <span className="shift-badge">🕒 {shiftName}</span>
            <span className="clock" aria-live="polite">
              {clock}
            </span>
          </div>
        </header>

        {/* Khung Chọn Loại Form */}
        <section className="template-selection-card">
          <div className="template-selection-header">
            <div>
              <span className="step-tag">BƯỚC 1 / 2</span>
              <h2>Chọn loại form / bảng kiểm cần báo cáo</h2>
              <p className="muted">
                Phòng này có <strong>{data.templates.length} mẫu form</strong>. Bạn có thể chọn 1 hoặc nhiều mẫu để điền và báo cáo cùng lúc:
              </p>
            </div>
          </div>

          {/* Thanh thao tác nhanh */}
          <div className="selection-toolbar">
            <div className="selected-counter">
              Đã chọn: <strong>{selectedTemplateIds.length}</strong>/{data.templates.length} mẫu
            </div>
            <div className="toolbar-buttons">
              <button
                type="button"
                className="btn-link-action"
                onClick={selectAllTemplates}
              >
                ✓ Chọn tất cả mẫu
              </button>
              {selectedTemplateIds.length > 0 && (
                <button
                  type="button"
                  className="btn-text-danger"
                  onClick={deselectAllTemplates}
                >
                  Bỏ chọn tất cả
                </button>
              )}
            </div>
          </div>

          {/* Danh sách các Thẻ Mẫu Form (Checkable Cards) */}
          <div className="templates-list-grid">
            {data.templates.map((tpl) => {
              const isSelected = selectedTemplateIds.includes(tpl.id);
              // Tìm xem mẫu này hôm nay đã có ai nộp chưa
              const todaySub = todaySubmissions.find((s) => s.template_id === tpl.id);

              return (
                <div
                  key={tpl.id}
                  className={`template-option-card ${isSelected ? 'selected' : ''}`}
                  onClick={() => toggleTemplateSelect(tpl.id)}
                  role="checkbox"
                  aria-checked={isSelected}
                  tabIndex={0}
                >
                  <div className="tpl-check-box" aria-hidden>
                    {isSelected ? '✓' : ''}
                  </div>

                  <div className="tpl-card-content">
                    <strong className="tpl-title">{tpl.name}</strong>
                    <div className="tpl-meta-tags">
                      <span className="tpl-items-count">📝 {tpl.items.length} mục kiểm tra</span>
                      {tpl.allow_photo ? (
                        <span className="tpl-photo-badge">📷 Có đính kèm ảnh</span>
                      ) : null}
                    </div>

                    {/* Trạng thái hôm nay */}
                    {todaySub ? (
                      <div className="tpl-today-status ok">
                        ✓ Đã báo cáo hôm nay ({todaySub.performer_name} lúc {todaySub.time_display} — {todaySub.is_complete ? 'Đủ' : 'Thiếu mục'})
                      </div>
                    ) : (
                      <div className="tpl-today-status pending">
                        ⏳ Chưa có báo cáo trong ca hôm nay
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Thông báo lỗi nếu có */}
          {error && <div className="alert error" style={{ marginTop: '14px' }}>{error}</div>}

          {/* Nút Tiếp Tục Sang Bước 2 */}
          <div className="selection-next-actions">
            <button
              type="button"
              className="btn btn-submit-checklist"
              onClick={handleProceedToFill}
              disabled={selectedTemplateIds.length === 0}
            >
              <span>
                TIẾP TỤC ĐIỀN BÁO CÁO ({selectedTemplateIds.length} MẪU ĐÃ CHỌN) →
              </span>
            </button>
            {selectedTemplateIds.length === 0 && (
              <p className="hint center">Vui lòng tích chọn ít nhất 1 mẫu form ở trên để tiếp tục.</p>
            )}
          </div>
        </section>

        {/* Bảng theo dõi checklist giấy thực tế của viện */}
        <PaperChecklistTable />
      </div>
    );
  }

  // ========================================================
  // BƯỚC 2: MÀN HÌNH ĐIỀN BÁO CÁO CÁC MẪU ĐÃ CHỌN (FILL FORM)
  // ========================================================
  return (
    <div className="page fill-page">
      {/* Thanh điều hướng */}
      <div className="fill-top-nav">
        <button
          type="button"
          className="btn-back-link"
          onClick={() => setCurrentStep('SELECT_TEMPLATES')}
          title="Quay lại danh sách chọn form"
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
        >
          ← Chọn lại danh sách form
        </button>
        <div className="network-status-indicator">
          <span className={`dot ${online ? 'online' : 'offline'}`} />
          <span>{online ? 'Trực tuyến' : 'Ngoại tuyến'}</span>
          {pendingCount > 0 && <span className="pending-pill">{pendingCount} chờ gửi</span>}
        </div>
      </div>

      {/* Header thông tin phòng & ca */}
      <header className="fill-header">
        <div className="dept-badge">{data.room.department_name}</div>
        <h1 className="room-title">{data.room.name}</h1>
        <div className="meta-bar">
          <span className="shift-badge">🕒 {shiftName}</span>
          <span className="clock" aria-live="polite">
            {clock}
          </span>
        </div>
      </header>

      {/* Thanh Tổng Tiến độ */}
      <div className="progress-section">
        <div className="progress-header">
          <div>
            <span className="step-tag">BƯỚC 2 / 2</span>
            <span className="progress-label" style={{ display: 'block', marginTop: '2px' }}>
              Báo cáo {activeTemplates.length} loại form đã chọn
            </span>
          </div>
          <span className={`progress-numbers ${totalDoneCount === totalItemsCount ? 'all-done' : ''}`}>
            <strong>{totalDoneCount}</strong>/{totalItemsCount} mục ({progressPercent}%)
          </span>
        </div>

        <div className="progress-bar-track">
          <div
            className={`progress-bar-fill ${totalDoneCount === totalItemsCount ? 'complete' : ''}`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        <div className="progress-quick-actions">
          <button
            type="button"
            className="btn-quick-action"
            onClick={tickAllActiveTemplates}
            title="Tick tất cả mục trên tất cả các form đã chọn"
          >
            ✓ Tick tất cả các form
          </button>
          {totalDoneCount > 0 && (
            <button
              type="button"
              className="btn-quick-action ghost"
              onClick={untickAllActiveTemplates}
              title="Bỏ chọn tất cả"
            >
              ↺ Bỏ chọn
            </button>
          )}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="fill-form">
        {/* Danh sách từng Mẫu Form được chia Section rõ ràng */}
        {activeTemplates.map((tpl, tplIndex) => {
          const tplTicks = ticksByTemplate[tpl.id] || {};
          const tplDone = tpl.items.filter((it) => tplTicks[String(it.id)]).length;
          const isTplComplete = tplDone === tpl.items.length;

          return (
            <section key={tpl.id} className="template-form-section">
              <div className="tpl-section-header">
                <div className="tpl-section-title-wrap">
                  <span className="tpl-section-number">{tplIndex + 1}</span>
                  <div>
                    <h2 className="tpl-section-title">{tpl.name}</h2>
                    <span className="tpl-section-progress">
                      Hoàn thành: <strong>{tplDone}</strong>/{tpl.items.length} mục
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  className="btn-quick-action-sm"
                  onClick={() => tickAllInTemplate(tpl.id)}
                  title="Tick đạt tất cả mục của form này"
                >
                  ✓ Tick mẫu này
                </button>
              </div>

              {/* Danh sách các mục của form này */}
              <ul className="tick-list">
                {tpl.items.map((it, idx) => {
                  const checked = !!tplTicks[String(it.id)];
                  return (
                    <li key={it.id}>
                      <button
                        type="button"
                        className={`tick-item-card ${checked ? 'is-checked' : ''}`}
                        onClick={() => toggleItem(tpl.id, it.id)}
                        aria-pressed={checked}
                      >
                        <span className="item-order">{idx + 1}</span>
                        <span className="item-content">{it.content}</span>
                        <span className="item-check-box" aria-hidden>
                          {checked ? '✓' : ''}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}

        {/* Thông tin Người thực hiện */}
        <div className="form-card-field">
          <label className="field-label" htmlFor="performer-name">
            <span>Người thực hiện</span> <span className="req">*</span>
          </label>
          <input
            id="performer-name"
            type="text"
            className="text-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nhập họ và tên nhân viên kiểm tra…"
            autoComplete="name"
            list="name-suggestions"
            required
            minLength={2}
            maxLength={80}
          />
          <datalist id="name-suggestions">
            {suggestions.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>

          {/* Gợi ý tên nhanh dạng chip */}
          {suggestions.length > 0 && !suggestions.includes(name) && (
            <div className="name-chips">
              <span className="chips-hint">Gợi ý gần đây:</span>
              {suggestions.slice(0, 3).map((s) => (
                <button
                  key={s}
                  type="button"
                  className="chip-name"
                  onClick={() => setName(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Ô Ghi chú */}
        <div className={`form-card-field ${missingItemsCount > 0 ? 'highlight-required' : ''}`}>
          <label className="field-label" htmlFor="checklist-note">
            <span>Ghi chú chung</span>{' '}
            {missingItemsCount > 0 ? (
              <span className="req-alert">(Bắt buộc: còn {missingItemsCount} mục chưa làm)</span>
            ) : (
              <span className="opt">(Tùy chọn)</span>
            )}
          </label>

          {/* Gợi ý lý do nhanh nếu còn mục thiếu */}
          {missingItemsCount > 0 && (
            <div className="quick-reasons-wrap">
              <span className="quick-reason-label">Chọn nhanh lý do:</span>
              <div className="quick-reason-chips">
                {COMMON_REASONS.map((reason) => (
                  <button
                    key={reason}
                    type="button"
                    className="chip-reason"
                    onClick={() => addQuickReason(reason)}
                  >
                    + {reason}
                  </button>
                ))}
              </div>
            </div>
          )}

          <textarea
            id="checklist-note"
            className="textarea-input"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder={
              missingItemsCount > 0
                ? 'Ghi rõ lý do tại sao các mục trên chưa hoàn thành…'
                : 'Ghi chú thêm nếu có phát hiện bất thường…'
            }
            maxLength={500}
          />
          <p className="security-notice">
            🔒 <strong>Quy định bảo mật y tế:</strong> Tuyệt đối không nhập thông tin định danh của bệnh nhân.
          </p>
        </div>

        {/* Đính kèm Ảnh (nếu có ít nhất 1 form cho phép ảnh) */}
        {activeTemplates.some((t) => t.allow_photo) && (
          <div className="form-card-field">
            <label className="field-label">
              <span>Ảnh kiểm tra buồng / thiết bị (Tối đa 5 MB)</span>
            </label>

            {photoPreview ? (
              <div className="photo-preview-wrap">
                <img src={photoPreview} alt="Xem trước ảnh chụp" className="photo-thumb" />
                <div className="photo-info">
                  <strong>{photo?.name || 'Ảnh đã chọn'}</strong>
                  <span>{Math.round((photo?.size || 0) / 1024)} KB</span>
                  <button
                    type="button"
                    className="btn-danger-sm"
                    onClick={removePhoto}
                  >
                    🗑 Xóa ảnh & chụp lại
                  </button>
                </div>
              </div>
            ) : (
              <label className="photo-upload-dropzone">
                <span className="upload-icon">📷</span>
                <span className="upload-title">Chụp ảnh hoặc Chọn từ thư viện</span>
                <span className="upload-hint">Tự động nén ảnh tối ưu dung lượng</span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={onPhotoChange}
                  style={{ display: 'none' }}
                />
              </label>
            )}
          </div>
        )}

        {/* Thông báo lỗi nếu có */}
        {error && <div className="alert error">{error}</div>}

        {/* Nút Gửi Báo Cáo */}
        <button
          type="submit"
          className="btn btn-submit-checklist"
          disabled={submitting}
        >
          {submitting ? (
            <span className="submit-loading">
              <span className="spinner-inline" /> Đang gửi báo cáo {activeTemplates.length} form…
            </span>
          ) : (
            <span>XÁC NHẬN & GỬI BÁO CÁO ({activeTemplates.length} FORM)</span>
          )}
        </button>

        <p className="submit-legal-hint">
          ✓ Thời gian thực hiện được chứng thực tự động từ máy chủ bệnh viện.
        </p>
      </form>
    </div>
  );
}
