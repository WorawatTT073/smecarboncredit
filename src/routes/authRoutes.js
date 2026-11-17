const express = require('express');
const pool = require('../config/database');
const { accountProfile, signToken, requireAuth } = require('../middleware/authMiddleware');
const { ApiError, asyncRoute } = require('../services/ets');
const { hashPassword, verifyPassword, isPasswordInput, minimumPasswordLength } = require('../services/passwords');

const router = express.Router();
router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

router.post('/login', asyncRoute(async (req, res) => {
  const { email, password } = req.body;
  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  const invalidLogin = 'อีเมลหรือรหัสผ่านไม่ถูกต้อง';
  if (!normalizedEmail || normalizedEmail.length > 254 || !isPasswordInput(password)) {
    throw new ApiError(401, invalidLogin);
  }

  const { rows: [account] } = await pool.query(`
    SELECT id, email, name, role, company_id, session_version, password_salt, password_hash
    FROM app_accounts WHERE email = $1
  `, [normalizedEmail]);

  if (!await verifyPassword(password, account)) throw new ApiError(401, invalidLogin);
  res.json({ token: signToken(account), user: accountProfile(account) });
}));

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

router.patch('/me', requireAuth, asyncRoute(async (req, res) => {
  const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
  if (!name || name.length > 100) throw new ApiError(400, 'กรุณาระบุชื่อที่แสดง 1 ถึง 100 ตัวอักษร');
  const { accountId, sessionVersion } = req.auth;
  const { rows: [account] } = await pool.query(`
    UPDATE app_accounts SET name = $1 WHERE id = $2 AND session_version = $3
    RETURNING email, name, role, company_id
  `, [name, accountId, sessionVersion]);
  if (!account) throw new ApiError(409, 'ข้อมูลบัญชีเปลี่ยนไป กรุณาเข้าสู่ระบบใหม่');
  res.json({ user: accountProfile(account) });
}));

router.put('/me/password', requireAuth, asyncRoute(async (req, res) => {
  const { current_password, new_password } = req.body;
  if (!isPasswordInput(current_password)) throw new ApiError(400, 'กรุณากรอกรหัสผ่านปัจจุบัน');
  if (!isPasswordInput(new_password) || new_password.length < minimumPasswordLength) {
    throw new ApiError(400, 'รหัสผ่านใหม่ต้องยาวอย่างน้อย 12 ตัวอักษรและไม่เกิน 256 ไบต์');
  }
  if (new_password === current_password) throw new ApiError(400, 'กรุณาตั้งรหัสผ่านใหม่ที่ต่างจากเดิม');

  const { accountId, sessionVersion } = req.auth;
  const { rows: [credentials] } = await pool.query(`
    SELECT password_salt, password_hash FROM app_accounts WHERE id = $1 AND session_version = $2
  `, [accountId, sessionVersion]);
  if (!credentials) throw new ApiError(409, 'ข้อมูลบัญชีเปลี่ยนไป กรุณาเข้าสู่ระบบใหม่');
  if (!await verifyPassword(current_password, credentials)) throw new ApiError(400, 'รหัสผ่านปัจจุบันไม่ถูกต้อง');

  const { salt, hash } = await hashPassword(new_password);
  const { rows: [account] } = await pool.query(`
    UPDATE app_accounts SET password_hash = $1, password_salt = $2, session_version = session_version + 1
    WHERE id = $3 AND session_version = $4
    RETURNING id, session_version
  `, [hash, salt, accountId, sessionVersion]);
  if (!account) throw new ApiError(409, 'ข้อมูลบัญชีเปลี่ยนไป กรุณาเข้าสู่ระบบใหม่');

  res.json({ token: signToken(account) });
}));

module.exports = router;
