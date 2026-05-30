import { verifyToken } from './jwt.js';

export function requireAuth(req, res, next) {
  let token = null;

  // Priority: Authorization header → query param (for EventSource/WebSocket) → cookie
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.slice(7);
  } else if (req.query?.token) {
    token = req.query.token;
  } else if (req.cookies?.apex_token) {
    token = req.cookies.apex_token;
  }

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    req.user = verifyToken(token);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}
