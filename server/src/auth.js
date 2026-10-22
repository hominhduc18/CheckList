import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from './db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'checklist-bv-local-secret-doi-khi-deploy';
const JWT_DAYS = 7;

export function hashPassword(plain) {
  return bcrypt.hashSync(plain, 10);
}

export function verifyPassword(plain, hash) {
  return bcrypt.compareSync(plain, hash);
}

export function signToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      department_ids: parseIds(user.department_ids),
    },
    JWT_SECRET,
    { expiresIn: `${JWT_DAYS}d` }
  );
}

export function parseIds(v) {
  try {
    const arr = typeof v === 'string' ? JSON.parse(v) : v;
    return Array.isArray(arr) ? arr.map(Number) : [];
  } catch {
    return [];
  }
}

/** Middleware: bắt buộc đăng nhập */
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Cần đăng nhập.' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    const row = db
      .prepare('SELECT id, is_active, role, department_ids, email, full_name FROM managers WHERE id = ?')
      .get(req.user.id);
    if (!row || !row.is_active) {
      return res.status(401).json({ error: 'Tài khoản không còn hiệu lực.' });
    }
    req.user.role = row.role;
    req.user.email = row.email;
    req.user.full_name = row.full_name;
    req.user.department_ids = parseIds(row.department_ids);
    next();
  } catch {
    return res.status(401).json({ error: 'Phiên đăng nhập hết hạn.' });
  }
}

/** Middleware: không bắt buộc đăng nhập (nếu có token thì gán req.user) */
export function optionalAuth(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next();
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    const row = db
      .prepare('SELECT id, is_active, role, department_ids, email, full_name FROM managers WHERE id = ?')
      .get(req.user.id);
    if (row && row.is_active) {
      req.user.role = row.role;
      req.user.email = row.email;
      req.user.full_name = row.full_name;
      req.user.department_ids = parseIds(row.department_ids);
    }
  } catch {
    /* ignore */
  }
  next();
}

export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Chỉ admin được thực hiện.' });
  }
  next();
}

/** Lọc theo khoa được gán (manager). Admin = tất cả */
export function allowedDepartmentNames(user) {
  if (!user || user.role === 'admin') return null; // null = không giới hạn
  const ids = user.department_ids || [];
  if (!ids.length) return [];
  const rows = db
    .prepare(
      `SELECT name FROM departments WHERE id IN (${ids.map(() => '?').join(',')})`
    )
    .all(...ids);
  return rows.map((r) => r.name);
}

export function assertDeptAccess(user, departmentName) {
  const allowed = allowedDepartmentNames(user);
  if (allowed === null) return true;
  return allowed.includes(departmentName);
}
