import { db, initSchema } from './db.js';
import { nanoid } from 'nanoid';
import { hashPassword } from './auth.js';

initSchema();

const adminExists = db.prepare(`SELECT id FROM managers WHERE role = 'admin' LIMIT 1`).get();
if (!adminExists) {
  db.prepare(
    `INSERT INTO managers (email, password_hash, full_name, role, department_ids)
     VALUES (?, ?, ?, 'admin', '[]')`
  ).run('admin@bv.local', hashPassword('Admin@123'), 'Quản trị hệ thống');
  console.log('Tài khoản admin: admin@bv.local / Admin@123');
}

const count = db.prepare('SELECT COUNT(*) AS c FROM departments').get().c;
if (count > 0) {
  console.log('Đã có dữ liệu khoa — bỏ qua seed khoa.');
  const room = db.prepare('SELECT qr_code, name FROM rooms LIMIT 1').get();
  if (room) {
    console.log(`Phòng mẫu: ${room.name}`);
    console.log(`Mã QR / URL: /r/${room.qr_code}`);
  }
  process.exit(0);
}

const insertDept = db.prepare('INSERT INTO departments (name) VALUES (?)');
const insertRoom = db.prepare(
  'INSERT INTO rooms (department_id, name, qr_code) VALUES (?, ?, ?)'
);
const insertTpl = db.prepare(
  'INSERT INTO templates (room_id, name, shift, allow_photo, sort_order) VALUES (?, ?, ?, ?, ?)'
);
const insertItem = db.prepare(
  'INSERT INTO template_items (template_id, content, sort_order) VALUES (?, ?, ?)'
);

const run = db.transaction(() => {
  const deptId = insertDept.run('Khoa Khám bệnh').lastInsertRowid;
  const qrCode = nanoid(16);
  const roomId = insertRoom.run(deptId, 'Khoa Khám bệnh', qrCode).lastInsertRowid;

  const tplId = insertTpl.run(roomId, 'Bảng kiểm Vệ sinh & Buồng phòng', 'ca_ngay', 1, 0).lastInsertRowid;

  const items = [
    'Vệ sinh bàn khám, giường khám, phòng',
    'Vệ sinh máy móc, thiết bị, máy tính',
    'Kiểm tra đầy đủ dụng cụ phòng',
    'Thay khay dụng cụ khám / thủ thuật',
    'Cồn xịt sát khuẩn',
    'Sắp xếp phòng gọn gàng, sạch sẽ',
  ];
  items.forEach((content, i) => insertItem.run(tplId, content, i));

  // Quản lý khoa demo
  db.prepare(
    `INSERT INTO managers (email, password_hash, full_name, role, department_ids)
     VALUES (?, ?, ?, 'manager', ?)`
  ).run(
    'khoa.kham@bv.local',
    hashPassword('Manager@123'),
    'Quản lý Khoa Khám',
    JSON.stringify([deptId])
  );

  return { qrCode };
});

const { qrCode } = run();
console.log('Seed OK.');
console.log('Khoa: Khoa Khám bệnh | Tên kiểm tra: Khoa Khám bệnh');
console.log(`Mã phòng (QR): ${qrCode}`);
console.log(`Form: http://localhost:5173/r/${qrCode}`);
console.log('Admin: admin@bv.local / Admin@123');
console.log('Quản lý khoa: khoa.kham@bv.local / Manager@123');
