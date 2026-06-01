import express from 'express';
import os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import { getActivityLog } from '../../../../services/monitoring/activity.js';

const router = express.Router();
const execAsync = promisify(exec);

// GET /system/status — CPU, memory, disk, uptime, PM2 processes
router.get('/status', async (req, res) => {
  try {
    const cpus    = os.cpus();
    const totalMem = os.totalmem();
    const freeMem  = os.freemem();
    const usedMem  = totalMem - freeMem;

    let disk = null;
    try {
      const { stdout } = await execAsync("df -h / | tail -1 | awk '{print $2, $3, $4, $5}'", { timeout: 3000 });
      const [total, used, available, percent] = stdout.trim().split(/\s+/);
      disk = { total, used, available, percent };
    } catch { /* disk info optional */ }

    let pm2 = [];
    try {
      const { stdout } = await execAsync('pm2 jlist', { timeout: 5000 });
      const procs = JSON.parse(stdout);
      pm2 = procs.map(p => ({
        name:     p.name,
        pid:      p.pid,
        status:   p.pm2_env?.status,
        cpu:      p.monit?.cpu !== undefined ? `${p.monit.cpu}%` : null,
        memory:   p.monit?.memory ? `${Math.round(p.monit.memory / 1024 / 1024)}MB` : null,
        restarts: p.pm2_env?.restart_time ?? 0,
        uptime:   p.pm2_env?.pm_uptime ? Math.floor((Date.now() - p.pm2_env.pm_uptime) / 1000) : null
      }));
    } catch { /* pm2 not installed or no processes */ }

    res.json({
      ok: true,
      hostname:    os.hostname(),
      platform:    os.platform(),
      arch:        os.arch(),
      nodeVersion: process.version,
      uptime: {
        process: Math.floor(process.uptime()),
        system:  Math.floor(os.uptime())
      },
      memory: {
        total:   `${Math.round(totalMem / 1024 / 1024)}MB`,
        used:    `${Math.round(usedMem  / 1024 / 1024)}MB`,
        free:    `${Math.round(freeMem  / 1024 / 1024)}MB`,
        percent: `${Math.round((usedMem / totalMem) * 100)}%`,
        bytes:   { total: totalMem, used: usedMem, free: freeMem }
      },
      cpu: {
        cores:   cpus.length,
        model:   cpus[0]?.model,
        loadAvg: os.loadavg().map(n => Math.round(n * 100) / 100)
      },
      disk,
      pm2,
      env: {
        nodeEnv:          process.env.NODE_ENV || 'development',
        aiConfigured:     !!process.env.DEEPSEEK_API_KEY,
        githubConfigured: !!process.env.GITHUB_TOKEN,
        dbConfigured:     !!process.env.DATABASE_URL
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /system/activity — persistent audit log
router.get('/activity', async (req, res) => {
  const { limit = 100, category, action } = req.query;
  try {
    const log = await getActivityLog({ limit: Number(limit), category, action });
    res.json(log);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Legacy compat
router.post('/sanitize',    (req, res) => res.json({ safe: true, command: req.body.command }));
router.post('/log',         (req, res) => res.json({ logged: true }));
router.get('/logs', async (req, res) => {
  try { res.json(await getActivityLog({ limit: 100 })); }
  catch { res.json([]); }
});

export default router;
