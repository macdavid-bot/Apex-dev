import express from 'express';
import { cloneRepository } from '../../../../services/git/clone.js';
import { createBranch, checkoutBranch, listBranches } from '../../../../services/git/branch.js';
import { createCommit, getStatus } from '../../../../services/git/commit.js';
import { generateDiff, diffUnstaged, pushBranch } from '../../../../services/git/diff.js';

const router = express.Router();

router.post('/clone', async (req, res) => {
  try {
    const result = await cloneRepository(req.body.repositoryUrl, req.body.workspace);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/branch', async (req, res) => {
  try {
    const branch = await createBranch(req.body.name, req.body.cwd);
    res.json(branch);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/checkout', async (req, res) => {
  try {
    const result = await checkoutBranch(req.body.name, req.body.cwd);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/branches', async (req, res) => {
  try {
    const result = await listBranches(req.query.cwd);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/commit', async (req, res) => {
  try {
    const commit = await createCommit(req.body.message, req.body.files || [], req.body.cwd);
    res.json(commit);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/status', async (req, res) => {
  try {
    const result = await getStatus(req.query.cwd);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/diff', async (req, res) => {
  try {
    const diff = await generateDiff(req.body.before, req.body.after, req.body.cwd);
    res.json(diff);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/diff/unstaged', async (req, res) => {
  try {
    const diff = await diffUnstaged(req.body.cwd);
    res.json(diff);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/push', async (req, res) => {
  try {
    const result = await pushBranch(req.body.branch, req.body.remote, req.body.cwd);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
