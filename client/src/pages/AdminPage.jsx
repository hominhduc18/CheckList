import { useEffect, useState } from 'react';
import { admin, downloadAuth } from '../api.js';
import { useAuth } from '../auth.jsx';
import QrViewModal from '../components/QrViewModal.jsx';

export default function AdminPage() {
  const { isAdmin } = useAuth();
  const [tab, setTab] = useState(isAdmin ? 'khoa' : 'phong');
  const [error, setError] = useState('');
  const [departments, setDepartments] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [managers, setManagers] = useState([]);
  const [audit, setAudit] = useState([]);
  const [settings, setSettings] = useState({});
  const [viewingQrRoom, setViewingQrRoom] = useState(null);

  const [deptName, setDeptName] = useState('');
  const [roomForm, setRoomForm] = useState({ name: '', department_id: '' });
  const [tplForm, setTplForm] = useState({
    room_id: '',
    name: 'Checklist hằng ngày',
    shift: 'ca_ngay',
    allow_photo: true,
    itemsText: '',
  });
  const [mgrForm, setMgrForm] = useState({
    email: '',
    password: '',
    full_name: '',
    role: 'manager',
    department_ids: [],
  });

  async function reload() {
    setError('');
    try {
      const [d, r, t] = await Promise.all([
        admin.departments(),
        admin.rooms(),
        admin.templates(),
      ]);
      setDepartments(d);
      setRooms(r);
      setTemplates(t);
      if (isAdmin) {
        setManagers(await admin.managers());
        setAudit(await admin.audit());
        setSettings(await admin.settings());
      }
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    reload();
  }, [isAdmin]);

  const tabs = isAdmin
    ? [
        ['khoa', 'Khoa'],
        ['phong', 'Phòng / QR'],
        ['mau', 'Mẫu'],
        ['tk', 'Tài khoản'],
        ['cai', 'Cài đặt'],
        ['audit', 'Nhật ký'],
      ]
    : [['phong', 'Phòng / QR']];

  return (
    <div className="page">
      <header className="page-header">
        <h1>{isAdmin ? 'Quản trị' : 'Phòng & mã QR'}</h1>
      </header>

      <div className="tabs-inline">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`btn ghost ${tab === id ? 'on' : ''}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {error && <div className="alert error">{error}</div>}

      {tab === 'khoa' && isAdmin && (
        <section className="panel">
          <h2>Khoa</h2>
          <div className="preset-row">
            <input
              placeholder="Tên khoa mới"
              value={deptName}
              onChange={(e) => setDeptName(e.target.value)}
              style={{ flex: 1, minHeight: 44, padding: 10, border: '2px solid var(--border)', borderRadius: 10, color: 'var(--primary)' }}
            />
            <button
              type="button"
              className="btn primary"
              onClick={async () => {
                await admin.createDept(deptName);
                setDeptName('');
                reload();
              }}
            >
              Thêm
            </button>
          </div>
          <ul className="admin-list">
            {departments.map((d) => (
              <li key={d.id} className="admin-card">
                <strong>{d.name}</strong> {d.is_visible ? '' : '(đã ẩn)'}
                <div className="row-actions">
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={async () => {
                      const name = window.prompt('Đổi tên khoa', d.name);
                      if (!name) return;
                      await admin.updateDept(d.id, { name });
                      reload();
                    }}
                  >
                    Sửa
                  </button>
                  <button
                    type="button"
                    className="btn danger"
                    onClick={async () => {
                      await admin.updateDept(d.id, { is_visible: !d.is_visible });
                      reload();
                    }}
                  >
                    {d.is_visible ? 'Ẩn' : 'Hiện'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {tab === 'phong' && (
        <section className="panel">
          <h2>Phòng & QR</h2>
          {isAdmin && (
            <div className="filter-grid" style={{ marginBottom: 12 }}>
              <label className="field">
                <span>Khoa</span>
                <select
                  value={roomForm.department_id}
                  onChange={(e) => setRoomForm({ ...roomForm, department_id: e.target.value })}
                >
                  <option value="">Chọn khoa</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Tên phòng</span>
                <input
                  value={roomForm.name}
                  onChange={(e) => setRoomForm({ ...roomForm, name: e.target.value })}
                />
              </label>
              <button
                type="button"
                className="btn primary"
                onClick={async () => {
                  await admin.createRoom({
                    name: roomForm.name,
                    department_id: Number(roomForm.department_id),
                  });
                  setRoomForm({ name: '', department_id: roomForm.department_id });
                  reload();
                }}
              >
                Thêm phòng
              </button>
            </div>
          )}
          <ul className="admin-list">
            {rooms.map((r) => (
              <li key={r.id} className="admin-card">
                <strong>
                  {r.department_name} — {r.name}
                </strong>
                <div className="mono">{r.fill_url}</div>
                <div className="row-actions">
                  <button
                    type="button"
                    className="btn primary"
                    onClick={() => setViewingQrRoom({ ...r, qr_code: r.qr_code || r.fill_url?.split('/r/')?.[1] })}
                    style={{ background: '#0b5cab', color: '#fff', fontWeight: '700' }}
                  >
                    👁 Xem QR
                  </button>
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={() => downloadAuth(`/api/admin/rooms/${r.id}/qr.png`, `qr_${r.id}.png`)}
                  >
                    Tải PNG
                  </button>
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={() => downloadAuth(`/api/admin/rooms/${r.id}/qr.pdf`, `qr_${r.id}.pdf`)}
                  >
                    Tải PDF A5
                  </button>
                  {isAdmin && (
                    <>
                      <button
                        type="button"
                        className="btn"
                        onClick={async () => {
                          if (!window.confirm('Đổi mã phòng? QR cũ sẽ vô hiệu.')) return;
                          await admin.rotateQr(r.id);
                          reload();
                        }}
                      >
                        Đổi mã QR
                      </button>
                      <button
                        type="button"
                        className="btn danger"
                        onClick={async () => {
                          await admin.updateRoom(r.id, { is_visible: !r.is_visible });
                          reload();
                        }}
                      >
                        {r.is_visible ? 'Ẩn' : 'Hiện'}
                      </button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <p className="hint">In PDF A5 dán tại phòng. Nhân viên quét QR để mở form.</p>
        </section>
      )}

      {tab === 'mau' && isAdmin && (
        <section className="panel">
          <h2>Mẫu checklist</h2>
          <label className="field">
            <span>Phòng</span>
            <select
              value={tplForm.room_id}
              onChange={(e) => setTplForm({ ...tplForm, room_id: e.target.value })}
            >
              <option value="">Chọn phòng</option>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.department_name} — {r.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Tên mẫu</span>
            <input
              value={tplForm.name}
              onChange={(e) => setTplForm({ ...tplForm, name: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Ca</span>
            <select
              value={tplForm.shift}
              onChange={(e) => setTplForm({ ...tplForm, shift: e.target.value })}
            >
              <option value="ca_ngay">Cả ngày</option>
              <option value="sang">Sáng</option>
              <option value="chieu">Chiều</option>
            </select>
          </label>
          <label className="field">
            <span>Danh sách mục (mỗi dòng một mục)</span>
            <textarea
              rows={6}
              value={tplForm.itemsText}
              onChange={(e) => setTplForm({ ...tplForm, itemsText: e.target.value })}
              placeholder={'Vệ sinh...\nKiểm tra...'}
            />
          </label>
          <label className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              checked={tplForm.allow_photo}
              onChange={(e) => setTplForm({ ...tplForm, allow_photo: e.target.checked })}
            />
            <span>Cho phép đính kèm ảnh</span>
          </label>
          <button
            type="button"
            className="btn primary"
            onClick={async () => {
              await admin.createTemplate({
                room_id: Number(tplForm.room_id),
                name: tplForm.name,
                shift: tplForm.shift,
                allow_photo: tplForm.allow_photo,
                items: tplForm.itemsText.split('\n'),
              });
              setTplForm({ ...tplForm, itemsText: '' });
              reload();
            }}
          >
            Tạo mẫu
          </button>

          <ul className="admin-list" style={{ marginTop: 16 }}>
            {templates.map((t) => (
              <li key={t.id} className="admin-card">
                <strong>
                  {t.department_name} / {t.room_name} — {t.name}
                </strong>
                <div className="muted">
                  {t.items?.length || 0} mục · ca {t.shift}
                  {!t.is_visible ? ' · đã ẩn' : ''}
                </div>
                <ul className="missing" style={{ color: 'var(--primary)' }}>
                  {t.items?.map((it) => (
                    <li key={it.id}>{it.content}</li>
                  ))}
                </ul>
                <div className="row-actions">
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={async () => {
                      const text = window.prompt(
                        'Sửa mục (mỗi dòng một mục)',
                        (t.items || []).map((i) => i.content).join('\n')
                      );
                      if (text == null) return;
                      await admin.updateTemplate(t.id, { items: text.split('\n') });
                      reload();
                    }}
                  >
                    Sửa mục
                  </button>
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={async () => {
                      await admin.cloneTemplate(t.id);
                      reload();
                    }}
                  >
                    Nhân bản
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={async () => {
                      await admin.updateTemplate(t.id, { is_visible: !t.is_visible });
                      reload();
                    }}
                  >
                    {t.is_visible ? 'Ẩn' : 'Hiện'}
                  </button>
                  <button
                    type="button"
                    className="btn danger"
                    onClick={async () => {
                      if (!window.confirm('Xác nhận 1/2: Xóa mẫu? Bản đã gửi vẫn giữ nguyên.')) return;
                      if (!window.confirm('Xác nhận 2/2: Gõ OK để xóa vĩnh viễn mẫu này.')) return;
                      await admin.deleteTemplate(t.id);
                      reload();
                    }}
                  >
                    Xóa
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {tab === 'tk' && isAdmin && (
        <section className="panel">
          <h2>Tài khoản quản lý</h2>
          <label className="field">
            <span>Email</span>
            <input
              value={mgrForm.email}
              onChange={(e) => setMgrForm({ ...mgrForm, email: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Họ tên</span>
            <input
              value={mgrForm.full_name}
              onChange={(e) => setMgrForm({ ...mgrForm, full_name: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Mật khẩu</span>
            <input
              type="password"
              value={mgrForm.password}
              onChange={(e) => setMgrForm({ ...mgrForm, password: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Vai trò</span>
            <select
              value={mgrForm.role}
              onChange={(e) => setMgrForm({ ...mgrForm, role: e.target.value })}
            >
              <option value="manager">Quản lý khoa</option>
              <option value="admin">Admin</option>
            </select>
          </label>
          <label className="field">
            <span>Khoa được gán (giữ Ctrl để chọn nhiều)</span>
            <select
              multiple
              value={mgrForm.department_ids.map(String)}
              onChange={(e) =>
                setMgrForm({
                  ...mgrForm,
                  department_ids: [...e.target.selectedOptions].map((o) => Number(o.value)),
                })
              }
              style={{ minHeight: 100 }}
            >
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="btn primary"
            onClick={async () => {
              await admin.createManager(mgrForm);
              setMgrForm({
                email: '',
                password: '',
                full_name: '',
                role: 'manager',
                department_ids: [],
              });
              reload();
            }}
          >
            Tạo tài khoản
          </button>
          <ul className="admin-list" style={{ marginTop: 16 }}>
            {managers.map((m) => (
              <li key={m.id} className="admin-card">
                <strong>{m.email}</strong> — {m.full_name || '(không tên)'} · {m.role}
                <div className="muted">
                  Khoa: {(m.departments || []).map((d) => d.name).join(', ') || '—'}
                  {!m.is_active ? ' · ĐÃ KHÓA' : ''}
                </div>
                <div className="row-actions">
                  <button
                    type="button"
                    className="btn danger"
                    onClick={async () => {
                      await admin.updateManager(m.id, { is_active: !m.is_active });
                      reload();
                    }}
                  >
                    {m.is_active ? 'Khóa' : 'Mở khóa'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {tab === 'cai' && isAdmin && (
        <section className="panel">
          <h2>Cài đặt & sao lưu</h2>
          <label className="field">
            <span>Giờ nhắc việc (HH:mm)</span>
            <input
              value={settings.reminder_time || '08:30'}
              onChange={(e) => setSettings({ ...settings, reminder_time: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Email nhận báo cáo / nhắc (cách nhau bằng dấu phẩy)</span>
            <input
              value={settings.reminder_emails || ''}
              onChange={(e) => setSettings({ ...settings, reminder_emails: e.target.value })}
            />
          </label>
          <label className="field">
            <span>URL gốc app (in lên QR)</span>
            <input
              value={settings.app_base_url || ''}
              onChange={(e) => setSettings({ ...settings, app_base_url: e.target.value })}
            />
          </label>
          <div className="row-actions">
            <button
              type="button"
              className="btn primary"
              onClick={async () => {
                await admin.saveSettings(settings);
                alert('Đã lưu.');
              }}
            >
              Lưu cài đặt
            </button>
            <button
              type="button"
              className="btn"
              onClick={async () => {
                const { stats } = await import('../api.js');
                const r = await stats.backup();
                alert(`Đã sao lưu:\n${r.db}\n${r.json}`);
              }}
            >
              Sao lưu ngay
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => downloadAuth('/api/stats/export/full-json', 'checklist_full.json')}
            >
              Xuất toàn bộ JSON
            </button>
          </div>
        </section>
      )}

      {tab === 'audit' && isAdmin && (
        <section className="panel">
          <h2>Nhật ký thay đổi</h2>
          <ul className="admin-list">
            {audit.map((a) => (
              <li key={a.id} className="admin-card">
                <strong>
                  {a.at_time} — {a.actor}
                </strong>
                <div>
                  {a.action} · {a.entity}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Modal hiển thị mã QR trực tiếp trên màn hình */}
      <QrViewModal
        room={viewingQrRoom}
        onClose={() => setViewingQrRoom(null)}
      />
    </div>
  );
}
