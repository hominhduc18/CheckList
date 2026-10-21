import { db, initSchema } from './db.js';
import { hashPassword } from './auth.js';

initSchema();
const d = db.prepare('SELECT id FROM departments LIMIT 1').get();
const m = db.prepare("SELECT id FROM managers WHERE email = 'khoa.kham@bv.local'").get();
if (!m && d) {
  db.prepare(
    `INSERT INTO managers (email, password_hash, full_name, role, department_ids)
     VALUES (?, ?, ?, 'manager', ?)`
  ).run(
    'khoa.kham@bv.local',
    hashPassword('Manager@123'),
    'Quản lý Khoa Khám',
    JSON.stringify([d.id])
  );
  console.log('Đã tạo khoa.kham@bv.local / Manager@123');
} else {
  console.log(m ? 'Manager đã có' : 'Chưa có khoa');
}
