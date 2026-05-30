import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import shellRoutes from './routes/shell.js';
import approvalRoutes from './routes/approval.js';
import validationRoutes from './routes/validation.js';
import workspaceRoutes from './routes/workspace.js';
import repositoryRoutes from './routes/repository.js';
import contextRoutes from './routes/context.js';
import orchestratorRoutes from './routes/orchestrator.js';
import workflowRoutes from './routes/workflow.js';
import gitRoutes from './routes/git.js';
import validationEngineRoutes from './routes/validation-engine.js';
import deploymentRoutes from './routes/deployment.js';
import terminalRoutes from './routes/terminal.js';
import repairRoutes from './routes/repair.js';
import memoryRoutes from './routes/memory.js';
import systemRoutes from './routes/system.js';
import githubRoutes from './routes/github.js';
import vpsRoutes from './routes/vps.js';
import filesRoutes from './routes/files.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const isProd = process.env.NODE_ENV === 'production';

// ── Security & CORS ───────────────────────────────────────────────────────────
app.use(cors({
  origin: isProd
    ? (process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean)
    : true,
  credentials: true
}));

// ── Body parsing ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── Simple in-process rate limiting (per IP, no external dep needed) ──────────
const rateLimitStore = new Map();
app.use((req, res, next) => {
  const key = req.ip || 'unknown';
  const now = Date.now();
  const window = 60_000; // 1 minute
  const maxRequests = 300;

  const entry = rateLimitStore.get(key) || { count: 0, resetAt: now + window };
  if (now > entry.resetAt) { entry.count = 0; entry.resetAt = now + window; }
  entry.count++;
  rateLimitStore.set(key, entry);

  // Clean up old entries periodically
  if (Math.random() < 0.01) {
    for (const [k, v] of rateLimitStore) {
      if (now > v.resetAt) rateLimitStore.delete(k);
    }
  }

  if (entry.count > maxRequests) {
    return res.status(429).json({ error: 'Too many requests — slow down.' });
  }
  next();
});

// ── Request logging (lightweight, no external dep) ───────────────────────────
app.use((req, _res, next) => {
  if (isProd) console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Apex Dev API',
    version: '1.0.0',
    env: process.env.NODE_ENV || 'development',
    uptime: Math.floor(process.uptime()),
    aiConfigured: !!process.env.DEEPSEEK_API_KEY,
    githubConfigured: !!process.env.GITHUB_TOKEN
  });
});

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/shell', shellRoutes);
app.use('/approvals', approvalRoutes);
app.use('/validation', validationRoutes);
app.use('/workspace', workspaceRoutes);
app.use('/repository', repositoryRoutes);
app.use('/context', contextRoutes);
app.use('/orchestrator', orchestratorRoutes);
app.use('/workflow', workflowRoutes);
app.use('/git', gitRoutes);
app.use('/validation-engine', validationEngineRoutes);
app.use('/deployment', deploymentRoutes);
app.use('/terminal', terminalRoutes);
app.use('/repair', repairRoutes);
app.use('/memory', memoryRoutes);
app.use('/system', systemRoutes);
app.use('/github', githubRoutes);
app.use('/vps', vpsRoutes);
app.use('/files', filesRoutes);

// ── Serve frontend in production (only when dist exists) ──────────────────────
const distPath = path.resolve(__dirname, '../../../apps/web/dist');
if (existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err, req, res, _next) => {
  console.error(`[ERROR] ${req.method} ${req.path}:`, err.message);
  res.status(500).json({ error: isProd ? 'Internal server error' : err.message });
});

app.listen(PORT, HOST, () => {
  console.log(`Apex Dev API running on http://${HOST}:${PORT} [${process.env.NODE_ENV || 'development'}]`);
  if (!process.env.DEEPSEEK_API_KEY) console.warn('[WARN] DEEPSEEK_API_KEY not set — AI features disabled');
  if (!process.env.GITHUB_TOKEN)     console.warn('[WARN] GITHUB_TOKEN not set — GitHub features limited');
});
