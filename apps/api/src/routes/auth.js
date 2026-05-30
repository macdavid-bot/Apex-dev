import express from 'express';
import { generateToken } from '../../../../services/auth/jwt.js';
import { requireAuth } from '../../../../services/auth/middleware.js';

const router = express.Router();

const USERNAME = process.env.AUTH_USERNAME || 'mac_david';
const PASSWORD = process.env.AUTH_PASSWORD || '@Davidluiz4life';

// POST /auth/login
router.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'username and password are required' });
  }

  if (username !== USERNAME || password !== PASSWORD) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = generateToken({ username, role: 'admin' });

  // Set httpOnly cookie for browser security
  res.cookie('apex_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
  });

  res.json({ token, username, role: 'admin' });
});

// POST /auth/logout
router.post('/logout', (req, res) => {
  res.clearCookie('apex_token');
  res.json({ success: true });
});

// GET /auth/me — verify token and return user info
router.get('/me', requireAuth, (req, res) => {
  res.json({ username: req.user.username, role: req.user.role });
});

export default router;
