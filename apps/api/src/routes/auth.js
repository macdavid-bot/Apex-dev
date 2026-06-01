import express from 'express';
import { generateToken } from '../../../../services/auth/jwt.js';
import { requireAuth } from '../../../../services/auth/middleware.js';
import { logActivity } from '../../../../services/monitoring/activity.js';
import bcrypt from 'bcryptjs';

const router = express.Router();

// Hashed password cache — computed once on first login attempt
let _hashedPassword = null;

async function getHashedPassword() {
  if (_hashedPassword) return _hashedPassword;
  const raw = process.env.AUTH_PASSWORD;
  if (!raw) throw new Error('AUTH_PASSWORD not set');
  // If the stored password looks like a bcrypt hash already, use it directly
  if (raw.startsWith('$2')) {
    _hashedPassword = raw;
  } else {
    // Plain-text env var — hash it in memory (never store the hash back)
    _hashedPassword = await bcrypt.hash(raw, 10);
  }
  return _hashedPassword;
}

// POST /auth/login
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'username and password are required' });
  }

  const expectedUsername = process.env.AUTH_USERNAME;
  if (!expectedUsername) {
    return res.status(500).json({ error: 'AUTH_USERNAME not configured on server' });
  }

  // Username check (constant-time string compare via bcrypt timing is irrelevant for username)
  if (username !== expectedUsername) {
    await logActivity('auth', 'login_failed', { username, reason: 'invalid_username', ip: req.ip });
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  // bcrypt password check — timing-safe
  try {
    const hash = await getHashedPassword();
    const valid = await bcrypt.compare(password, hash);
    if (!valid) {
      await logActivity('auth', 'login_failed', { username, reason: 'invalid_password', ip: req.ip });
      return res.status(401).json({ error: 'Invalid credentials' });
    }
  } catch (err) {
    console.error('[AUTH] Password check error:', err.message);
    return res.status(500).json({ error: 'Authentication error' });
  }

  const token = generateToken({ username, role: 'admin' });

  res.cookie('apex_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000
  });

  await logActivity('auth', 'login_success', { username, ip: req.ip });
  res.json({ token, username, role: 'admin' });
});

// POST /auth/logout
router.post('/logout', async (req, res) => {
  res.clearCookie('apex_token');
  const user = req.user?.username || 'unknown';
  await logActivity('auth', 'logout', { username: user, ip: req.ip });
  res.json({ success: true });
});

// GET /auth/me — verify token and return user info
router.get('/me', requireAuth, (req, res) => {
  res.json({ username: req.user.username, role: req.user.role });
});

export default router;
