import express from 'express';
import { deployDockerService } from '../../../../services/deployment/docker.js';
import { managePM2Process } from '../../../../services/deployment/pm2.js';
import { installPackage } from '../../../../services/deployment/packages.js';
import { checkDeploymentHealth } from '../../../../services/deployment/health.js';

const router = express.Router();

router.post('/docker', async (req, res) => {
  const result = await deployDockerService(req.body.service);

  res.json(result);
});

router.post('/pm2', async (req, res) => {
  const result = await managePM2Process(req.body.name);

  res.json(result);
});

router.post('/package', async (req, res) => {
  const result = await installPackage(req.body.name);

  res.json(result);
});

router.post('/health', (req, res) => {
  const result = checkDeploymentHealth(req.body.service);

  res.json(result);
});

export default router;
