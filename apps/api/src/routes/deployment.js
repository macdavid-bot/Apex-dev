import express from 'express';
import { deployDockerService, getDockerStatus } from '../../../../services/deployment/docker.js';
import { managePM2Process, startPM2App, savePM2Config } from '../../../../services/deployment/pm2.js';
import { installPackage, installDependencies } from '../../../../services/deployment/packages.js';
import { checkDeploymentHealth } from '../../../../services/deployment/health.js';
import { getPM2Processes, getLocalServices, getVPSServices } from '../../../../services/deployment/monitor.js';

const router = express.Router();

// Deployment dashboard — aggregates PM2 + local service health + VPS sessions
router.get('/list', async (req, res) => {
  try {
    const [pm2, local, vps] = await Promise.all([
      getPM2Processes(),
      getLocalServices(),
      getVPSServices()
    ]);
    res.json([...pm2, ...local, ...vps]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Docker operations
router.post('/docker', async (req, res) => {
  const result = await deployDockerService(req.body.service, req.body.cwd);
  res.json(result);
});

router.get('/docker/status', async (req, res) => {
  const result = await getDockerStatus(req.query.cwd);
  res.json(result);
});

// PM2 operations
router.post('/pm2', async (req, res) => {
  const { name, action = 'restart' } = req.body;
  const result = await managePM2Process(name, action);
  res.json(result);
});

router.post('/pm2/start', async (req, res) => {
  const { script, name, cwd } = req.body;
  const result = await startPM2App(script, name, cwd);
  res.json(result);
});

router.post('/pm2/save', async (req, res) => {
  const result = await savePM2Config();
  res.json(result);
});

// Package management
router.post('/package', async (req, res) => {
  const result = await installPackage(req.body.name, req.body.cwd);
  res.json(result);
});

router.post('/install', async (req, res) => {
  const result = await installDependencies(req.body.cwd);
  res.json(result);
});

// Health check
router.post('/health', async (req, res) => {
  const result = await checkDeploymentHealth(req.body.service);
  res.json(result);
});

export default router;
