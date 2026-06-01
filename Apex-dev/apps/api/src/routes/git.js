import express from 'express';
import { cloneRepository } from '../../../../services/git/clone.js';
import { createBranch } from '../../../../services/git/branch.js';
import { createCommit } from '../../../../services/git/commit.js';
import { generateDiff } from '../../../../services/git/diff.js';

const router = express.Router();

router.post('/clone', async (req, res) => {
  const result = await cloneRepository(req.body.repositoryUrl, req.body.workspace);

  res.json(result);
});

router.post('/branch', (req, res) => {
  const branch = createBranch(req.body.name);

  res.json(branch);
});

router.post('/commit', (req, res) => {
  const commit = createCommit(req.body.message, req.body.files || []);

  res.json(commit);
});

router.post('/diff', (req, res) => {
  const diff = generateDiff(req.body.before, req.body.after);

  res.json(diff);
});

export default router;
