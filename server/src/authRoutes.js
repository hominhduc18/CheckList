import { Router } from 'express';
import { db } from './db.js';
import {
  verifyPassword,
  signToken,
  requireAuth,
  parseIds,
} from './auth.js';

export const authRouter = Router();

authRouter.post('/login', (req, res) => {
  const email = String(req.body.email || '')
    .trim()
    .toLowerCase();
  const password = String(req.body.password || '');
  const user = db.prepare('SELECT * FROM managers WHERE email = ?').get(email);
  if (!user || !user.is_active || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: 'Email hoặc mật khẩu không đúng.' });
  }
  const token = signToken(user);
  res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      full_name: user.full_name,
      role: user.role,
      department_ids: parseIds(user.department_ids),
    },
  });
});

authRouter.get('/me', requireAuth, (req, res) => {
  res.json({
    id: req.user.id,
    email: req.user.email,
    full_name: req.user.full_name,
    role: req.user.role,
    department_ids: req.user.department_ids,
  });
});
