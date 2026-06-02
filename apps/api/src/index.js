import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import http from 'http';
import { WebSocketServer } from 'ws';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

import { requireAuth }   from '../../../services/auth/middleware.js';
import { runMigrations } from '../../../services/db/migrations.js';
import { dbAvailable }   from '../../../services/db/client.js';
import { startWorker }   from '../../../services/queue/worker.js';
import { attachTerminalWS } from './ws/terminal.js';
import { attachVpsWS }      from './ws/vps.js';
import { logActivity }   from '../../../services/monitoring/activity.js';

import authRoutes           from './routes/auth.js';
import shellRoutes          from './routes/shell.js';
import approvalRoutes       from './routes/approval.js';
import validationRoutes     from './routes/validation.js';
import workspaceRoutes      from './routes/workspace.js';
import repositoryRoutes     from './routes/repository.js';
import contextRoutes        from './routes/context.js';
import orchestratorRoutes   from './routes/orchestrator.js';
import workflowRoutes       from './routes/workflow.js';
import gitRoutes            from './routes/git.js';
import validationEngineRoutes from './routes/validation-engine.js';
import deploymentRoutes     from './routes/deployment.js';
import terminalRoutes       from './routes/terminal.js';
import repairRoutes         from './routes/repair.js';
import memoryRoutes         from './routes/memory.js';
import systemRoutes         from './routes/system.js';
import githubRoutes         from './routes/github.js';
import vpsRoutes            from './routes/vps.js';
import filesRoutes          from './routes/files.js';
import jobsRoutes           from './routes/jobs.js';
import reposRoutes          from './routes/repos.js';
import rollbackRoutes       from './routes/rollback.js';
import domainsRoutes        from './routes/domains.js';
import dbAdminRoutes        from './routes/db-admin.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app    = express();
const server = http.createServer(app);
const PORT   = process.env.PORT || 3000;
const HOST   = process.env.HOST || '0.0.0.0';
const isProd = process.env.NODE_ENV === 'production';

// ── CORS ──────────────────────────────────────────────────────────────────────
app.use(cors({
  origin: isProd
    ? (process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean)
    : true,
  credentials: true
}));

// ── Body / cookie parsing ──────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// ── Rate limiting ──────────────────────────────────────────────────────────────
const rateLimitStore = new Map();
app.use((req, res, next) => {
  const key = req.ip || 'unknown';
  const now = Date.now();
  const entry = rateLimitStore.get(key) || { count: 0, resetAt: now + 60_000 };
  if (now > entry.resetAt) { entry.count = 0; entry.resetAt = now + 60_000; }
  entry.count++;
  rateLimitStore.set(key, entry);
  if (Math.random() < 0.01) for (const [k, v] of rateLimitStore) if (now > v.resetAt) rateLimitStore.delete(k);
  if (entry.count > 300) return res.status(429).json({ error: 'Too many requests' });
  next();
});

// ── Request logging ────────────────────────────────────────────────────────────
if (isProd) {
  app.use((req, _res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
  });
}

// ── Health (public) ────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'ok', service: 'Apex Dev API', version: '1.0.0',
    env: process.env.NODE_ENV || 'development',
    uptime: Math.floor(process.uptime()),
    aiConfigured:     !!process.env.DEEPSEEK_API_KEY,
    githubConfigured: !!process.env.GITHUB_TOKEN,
    dbConfigured:     !!process.env.DATABASE_URL
  });
});

// ── Public routes ──────────────────────────────────────────────────────────────
app.use('/auth', authRoutes);

// ── Protected routes (require JWT) ────────────────────────────────────────────
app.use('/shell',             requireAuth, shellRoutes);
app.use('/approvals',         requireAuth, approvalRoutes);
app.use('/validation',        requireAuth, validationRoutes);
app.use('/workspace',         requireAuth, workspaceRoutes);
app.use('/repository',        requireAuth, repositoryRoutes);
app.use('/context',           requireAuth, contextRoutes);
app.use('/orchestrator',      orchestratorRoutes);       // auth applied per-route inside
app.use('/workflow',          requireAuth, workflowRoutes);
app.use('/git',               requireAuth, gitRoutes);
app.use('/validation-engine', requireAuth, validationEngineRoutes);
app.use('/deployment',        requireAuth, deploymentRoutes);
app.use('/terminal',          requireAuth, terminalRoutes);
app.use('/repair',            requireAuth, repairRoutes);
app.use('/memory',            requireAuth, memoryRoutes);
app.use('/system',            requireAuth, systemRoutes);
app.use('/github',            requireAuth, githubRoutes);
app.use('/vps',               requireAuth, vpsRoutes);
app.use('/files',             requireAuth, filesRoutes);
app.use('/jobs',              jobsRoutes);                // auth applied per-route inside
app.use('/repos',             requireAuth, reposRoutes);
app.use('/rollback',          requireAuth, rollbackRoutes);
app.use('/domains',           requireAuth, domainsRoutes);
app.use('/db-admin',          requireAuth, dbAdminRoutes);

// ── WebSocket servers ─────────────────────────────────────────────────────────
const termWss = new WebSocketServer({ noServer: true });
const vpsWss  = new WebSocketServer({ noServer: true });

attachTerminalWS(termWss);
attachVpsWS(vpsWss);

server.on('upgrade', (req, socket, head) => {
  const { pathname } = new URL(req.url, `http://${req.headers.host}`);

  if (pathname === '/ws/terminal') {
    termWss.handleUpgrade(req, socket, head, ws => termWss.emit('connection', ws, req));
  } else if (pathname.startsWith('/ws/vps/')) {
    vpsWss.handleUpgrade(req, socket, head, ws => vpsWss.emit('connection', ws, req));
  } else {
    socket.destroy();
  }
});

// ── Serve frontend in production ───────────────────────────────────────────────
const distPath = path.resolve(__dirname, '../../../apps/web/dist');
if (existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (req, res) => res.sendFile(path.join(distPath, 'index.html')));
}

// ── Error handler ──────────────────────────────────────────────────────────────
app.use((err, req, res, _next) => {
  console.error(`[ERROR] ${req.method} ${req.path}:`, err.message);
  res.status(500).json({ error: isProd ? 'Internal server error' : err.message });
});

// ── Start ──────────────────────────────────────────────────────────────────────
server.listen(PORT, HOST, async () => {
  console.log(`Apex Dev API on http://${HOST}:${PORT} [${process.env.NODE_ENV || 'development'}]`);

  if (!process.env.DEEPSEEK_API_KEY) console.warn('[WARN] DEEPSEEK_API_KEY not set');
  if (!process.env.GITHUB_TOKEN)     console.warn('[WARN] GITHUB_TOKEN not set');
  if (!process.env.DATABASE_URL)     console.warn('[WARN] DATABASE_URL not set — using in-memory fallbacks');
  if (!process.env.JWT_SECRET)       console.warn('[WARN] JWT_SECRET not set — using insecure default');

  // DB migrations (non-blocking — app runs without DB)
  if (await dbAvailable()) {
    try { await runMigrations(); } catch (e) { console.error('[DB] Migration failed:', e.message); }
  }

  // Start background job worker
  startWorker(2000);

  // Log startup
  await logActivity('system', 'startup', {
    port: PORT,
    env: process.env.NODE_ENV || 'development',
    db: !!(await dbAvailable())
  });
});
