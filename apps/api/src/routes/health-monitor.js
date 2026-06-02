import express from 'express';
import { queryOne } from '../../../../services/db/client.js';
import { sessions as vpsSessions } from '../../../../services/vps/sessions.js';
import {
  listMonitorConfigs, getMonitorConfig, addMonitorConfig,
  updateMonitorConfig, deleteMonitorConfig, listAlerts, checkMonitor
} from '../../../../services/monitoring/vps-health.js';

const router = express.Router();

async function getServer(id) {
  try { return await queryOne('SELECT * FROM ssh_sessions WHERE id=$1', [id]); } catch {}
  return vpsSessions.get(id) || null;
}

// GET /health-monitor/configs
router.get('/configs', async (req, res) => {
  try { res.json(await listMonitorConfigs()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /health-monitor/configs
router.post('/configs', async (req, res) => {
  try {
    const { server_id, enabled, check_interval_sec, alert_webhook, alert_email, checks } = req.body;
    if (!server_id) return res.status(400).json({ error: 'server_id is required' });
    const rec = await addMonitorConfig({ server_id, enabled, check_interval_sec, alert_webhook, alert_email, checks });
    res.json(rec);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /health-monitor/configs/:id
router.get('/configs/:id', async (req, res) => {
  const c = await getMonitorConfig(req.params.id).catch(() => null);
  if (!c) return res.status(404).json({ error: 'not found' });
  res.json(c);
});

// PATCH /health-monitor/configs/:id
router.patch('/configs/:id', async (req, res) => {
  try {
    const c = await updateMonitorConfig(req.params.id, req.body);
    res.json(c);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /health-monitor/configs/:id
router.delete('/configs/:id', async (req, res) => {
  try { await deleteMonitorConfig(req.params.id); res.json({ success: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /health-monitor/configs/:id/check — run one check now
router.post('/configs/:id/check', async (req, res) => {
  try {
    const config = await getMonitorConfig(req.params.id);
    if (!config) return res.status(404).json({ error: 'config not found' });

    const server = await getServer(config.server_id);
    if (!server) return res.status(404).json({ error: 'VPS server not found' });

    const result = await checkMonitor(config, server);
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /health-monitor/alerts
router.get('/alerts', async (req, res) => {
  try { res.json(await listAlerts(parseInt(req.query.limit) || 50)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
