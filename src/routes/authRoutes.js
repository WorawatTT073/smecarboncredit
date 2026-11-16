const express = require('express');
const router = express.Router();
const { signToken, requireAuth } = require('../middleware/authMiddleware');

// Demo accounts only. Do not use this authentication approach for production.
const DEMO_USERS = {
  'admin@demo.com': { password: 'admin123', role: 'Admin', name: 'Demo Admin' },
  'customer@demo.com': { password: 'customer123', role: 'Customer', name: 'Demo Customer' },
  'partner@demo.com': { password: 'partner123', role: 'Partner', name: 'Demo Partner' }
};

router.post('/login', (req, res) => {
  const { email, password } = req.body;
  const user = DEMO_USERS[String(email || '').toLowerCase()];

  if (!user || password !== user.password) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const token = signToken({
    email: String(email).toLowerCase(),
    role: user.role,
    name: user.name,
    exp: Math.floor(Date.now() / 1000) + (8 * 60 * 60)
  });

  res.json({
    message: 'Login successful',
    token,
    user: { email: String(email).toLowerCase(), name: user.name, role: user.role }
  });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
