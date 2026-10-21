import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  checkDuplicate,
  getDeviceId,
  getNameSuggestions,
  getRememberedName,
  getRoomByQr,
  rememberName,
  submitChecklist,
} from '../api.js';
import { enqueueOffline, flushOfflineQueue, listOffline } from '../offline.js';

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
          resolve(new File([blob], 'anh.jpg', { type: 'image/jpeg' }));
        },
        'image/jpeg',
        0.72
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Không đọc được ảnh'));
    };
    img.src = url;
  });
}

export default function FillPage() {
  const { qrCode } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);
  const [templateId, setTemplateId] = useState(null);
  const [ticks, setTicks] = useState({});
  const [name, setName] = useState(getRememberedName());
  const [suggestions, setSuggestions] = useState([]);
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(null);
  const [clock, setClock] = useState('');
  const [online, setOnline] = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);

  const template = useMemo(
    () => data?.templates?.find((t) => t.id === templateId) || null,
    [data, templateId]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await getRoomByQr(qrCode);
      setData(res);
      if (res.templates?.length) {
        setTemplateId(res.templates[0].id);
        const init = {};
        res.templates[0].items.forEach((it) => {
          init[String(it.id)] = false;
        });
        setTicks(init);
      }
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

  useEffect(() => {
    if (!data?.room?.id) return;
    const t = setTimeout(() => {
      getNameSuggestions(data.room.id, name).then(setSuggestions);
    }, 200);
    return () => clearTimeout(t);
  }, [name, data?.room?.id]);

  useEffect(() => {
    if (!template) return;
    const init = {};
    template.items.forEach((it) => {
      init[String(it.id)] = ticks[String(it.id)] ?? false;
    });
    setTicks(init);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId]);

  const missingCount = useMemo(() => {
    if (!template) return 0;
    return template.items.filter((it) => !ticks[String(it.id)]).length;
  }, [template, ticks]);

  function toggleItem(id) {
    setTicks((prev) => ({ ...prev, [String(id)]: !prev[String(id)] }));
  }

  function tickAll() {
    if (!template) return;
    const next = {};
    template.items.forEach((it) => {
      next[String(it.id)] = true;
    });
    setTicks(next);
  }

  async function onPhotoChange(e) {
    const file = e.target.files?.[0];
    if (!file) {
      setPhoto(null);
      return;
    }
    try {
      const compressed = await compressImage(file);
      setPhoto(compressed);
    } catch (err) {
      setError(err.message);
      e.target.value = '';
      setPhoto(null);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!template || !data) return;
    setError('');

    if (!name.trim() || name.trim().length < 2) {
      setError('Vui lòng nhập tên người thực hiện.');
      return;
    }
    if (missingCount > 0 && !note.trim()) {
      setError('Còn mục chưa tick — bắt buộc ghi lý do vào ô Ghi chú.');
      return;
    }

    setSubmitting(true);
    try {
      let isSupplement = false;
      if (navigator.onLine) {
        try {
          const dup = await checkDuplicate({
            template_id: template.id,
            work_date: data.work_date,
            shift: data.shift,
          });
          if (dup.exists) {
            const ok = window.confirm(
              `Đã có bản gửi trong ca này (bởi ${dup.last.performer_name} lúc ${dup.last.time_display}).\n\nLưu thành "bản bổ sung"?`
            );
            if (!ok) {
              setSubmitting(false);
              return;
            }
            isSupplement = true;
          }
        } catch {
          /* mất mạng giữa chừng */
        }
      }

      const fields = {
        room_id: String(data.room.id),
        template_id: String(template.id),
        performer_name: name.trim(),
        note: note.trim(),
        tick_results: JSON.stringify(ticks),
        device_id: getDeviceId(),
        client_time: new Date().toISOString(),
        is_supplement: isSupplement ? '1' : '0',
      };

      if (!navigator.onLine) {
        await enqueueOffline({ fields, photoBlob: photo || null });
        rememberName(name.trim());
        const n = (await listOffline()).length;
        setPendingCount(n);
        setSuccess({
          performer_name: name.trim(),
          date_display: new Date().toLocaleDateString('vi-VN'),
          time_display: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
          is_complete: missingCount === 0,
          done_count: (template.items.length - missingCount),
          total_count: template.items.length,
          is_supplement: false,
          offline: true,
        });
        return;
      }

      const fd = new FormData();
      Object.entries(fields).forEach(([k, v]) => fd.append(k, v));
      if (photo) fd.append('photo', photo);

      const result = await submitChecklist(fd);
      rememberName(name.trim());
      setSuccess(result);
    } catch (err) {
      // Lưu tạm nếu lỗi mạng
      if (!navigator.onLine || /network|fetch|failed/i.test(err.message || '')) {
        try {
          await enqueueOffline({
            fields: {
              room_id: String(data.room.id),
              template_id: String(template.id),
              performer_name: name.trim(),
              note: note.trim(),
              tick_results: JSON.stringify(ticks),
              device_id: getDeviceId(),
              client_time: new Date().toISOString(),
              is_supplement: '0',
            },
            photoBlob: photo || null,
          });
          setPendingCount((await listOffline()).length);
          setSuccess({
            performer_name: name.trim(),
            date_display: new Date().toLocaleDateString('vi-VN'),
            time_display: new Date().toLocaleTimeString('vi-VN', {
              hour: '2-digit',
              minute: '2-digit',
            }),
            is_complete: missingCount === 0,
            done_count: template.items.length - missingCount,
            total_count: template.items.length,
            offline: true,
          });
          return;
        } catch {
          /* ignore */
        }
      }
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="page">
        <p className="muted">Đang tải checklist…</p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="page">
        <div className="alert error">{error}</div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="page">
        <div className="success-box">
          <div className="success-icon" aria-hidden>
            ✓
          </div>
          <h1>{success.offline ? 'Đã lưu — Chờ gửi' : 'Đã gửi thành công'}</h1>
          <p>
            <strong>{success.performer_name}</strong>
          </p>
          <p>
            {success.date_display} — {success.time_display}
          </p>
          {success.offline && (
            <p className="offline-banner">Mất mạng — sẽ tự gửi lại khi có mạng</p>
          )}
          <p>
            {success.is_complete
              ? `Đủ ${success.done_count}/${success.total_count} mục`
              : `Thiếu ${success.total_count - success.done_count} mục`}
            {success.is_supplement ? ' · Bản bổ sung' : ''}
          </p>
          <button
            type="button"
            className="btn primary"
            onClick={() => {
              setSuccess(null);
              setNote('');
              setPhoto(null);
              if (template) {
                const init = {};
                template.items.forEach((it) => {
                  init[String(it.id)] = false;
                });
                setTicks(init);
              }
              load();
            }}
          >
            Điền tiếp
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page fill-page">
      {(!online || pendingCount > 0) && (
        <div className="offline-banner">
          {!online ? 'Đang ngoại tuyến' : ''}
          {pendingCount > 0 ? ` · Chờ gửi: ${pendingCount} bản` : ''}
        </div>
      )}
      <header className="fill-header">
        <p className="dept">{data.room.department_name}</p>
        <h1>{data.room.name}</h1>
        <p className="clock" aria-live="polite">
          {clock}
        </p>
      </header>

      {data.templates.length > 1 && (
        <label className="field">
          <span>Chọn mẫu checklist</span>
          <select
            value={templateId || ''}
            onChange={(e) => setTemplateId(Number(e.target.value))}
          >
            {data.templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {template && (
        <form onSubmit={handleSubmit} className="fill-form">
          <div className="tick-toolbar">
            <span className="muted">
              Đã tick {template.items.length - missingCount}/{template.items.length}
            </span>
            <button type="button" className="btn ghost" onClick={tickAll}>
              Tick tất cả
            </button>
          </div>

          <ul className="tick-list">
            {template.items.map((it) => {
              const checked = !!ticks[String(it.id)];
              return (
                <li key={it.id}>
                  <button
                    type="button"
                    className={`tick-item ${checked ? 'on' : ''}`}
                    onClick={() => toggleItem(it.id)}
                    aria-pressed={checked}
                  >
                    <span className="box" aria-hidden>
                      {checked ? '✓' : ''}
                    </span>
                    <span className="label">{it.content}</span>
                  </button>
                </li>
              );
            })}
          </ul>

          <label className="field">
            <span>Người thực hiện</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Họ tên"
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
          </label>

          <label className="field">
            <span>
              Ghi chú {missingCount > 0 && <em className="req">(bắt buộc vì còn mục thiếu)</em>}
            </span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="Lý do mục chưa làm (nếu có)…"
              maxLength={500}
            />
            <small className="warn-note">⚠ Không nhập thông tin bệnh nhân</small>
          </label>

          {template.allow_photo && (
            <label className="field">
              <span>Ảnh đính kèm (tuỳ chọn, tối đa 5 MB)</span>
              <input type="file" accept="image/*" capture="environment" onChange={onPhotoChange} />
              {photo && (
                <small className="muted">
                  Đã chọn: {photo.name} ({Math.round(photo.size / 1024)} KB)
                </small>
              )}
            </label>
          )}

          {error && <div className="alert error">{error}</div>}

          <button type="submit" className="btn primary block" disabled={submitting}>
            {submitting ? 'Đang gửi…' : 'Gửi checklist'}
          </button>
          <p className="hint center">Giờ thực hiện lấy từ máy chủ — không nhập tay.</p>
        </form>
      )}
    </div>
  );
}
