import jwt from 'jsonwebtoken';

function getSecret() {
  const s = process.env.JWT_SECRET;
  if (!s) {
    console.warn('[AUTH] JWT_SECRET not set — using insecure fallback. Set JWT_SECRET in production!');
    return 'apex-dev-insecure-fallback-secret-change-me';
  }
  return s;
}

export function generateToken(payload) {
  return jwt.sign(payload, getSecret(), { expiresIn: '30d' });
}

export function verifyToken(token) {
  return jwt.verify(token, getSecret());
}
