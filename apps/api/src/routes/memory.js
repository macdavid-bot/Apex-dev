// Memory routes — legacy in-memory + new persistent global agent memory + project memory.
import express from 'express';
import { saveRepositoryMetadata, getRepositoryMetadata } from '../../../../services/memory/repository-cache.js';
import { storeContext, getContexts }   from '../../../../services/memory/context-store.js';
import { remember, recall, forget, CATEGORIES } from '../../../../services/memory/agent-memory.js';
import { getMemory, addFact, updateSummary } from '../../../../services/memory/project-memory.js';

const router = express.Router();

// ── Legacy in-memory routes (kept for backwards compat) ────────────────────────
router.post('/repository', (req, res) => {
  res.json(saveRepositoryMetadata(req.body.repo, req.body.metadata));
});
router.get('/repository/:repo', (req, res) => {
  res.json(getRepositoryMetadata(req.params.repo));
});
router.post('/context', (req, res) => {
  res.json({ stored: true, total: storeContext(req.body.context) });
});
router.get('/contexts', (req, res) => {
  res.json(getContexts());
});

// ── Global agent memory (persistent) ──────────────────────────────────────────

// GET /memory/agent?query=...&category=...&repo=...&limit=...
router.get('/agent', async (req, res) => {
  try {
    const { query: q, category, repo, limit = 100 } = req.query;
    const entries = await recall({ query: q, category, repoName: repo, limit: Number(limit) });
    res.json({ entries, categories: CATEGORIES });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /memory/agent — store a new memory
router.post('/agent', async (req, res) => {
  try {
    const { category = 'fact', key, value, tags = [], repoName = '' } = req.body;
    if (!key || !value) return res.status(400).json({ error: 'key and value are required' });
    const entry = await remember({ category, key, value, tags, repoName });
    res.json(entry);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /memory/agent/:id — forget a memory
router.delete('/agent/:id', async (req, res) => {
  try {
    await forget(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/categories', (req, res) => {
  res.json(CATEGORIES);
});

// ── Per-project memory ────────────────────────────────────────────────────────

router.get('/project/:owner/:repo', async (req, res) => {
  try {
    res.json(await getMemory(req.params.owner, req.params.repo));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/project/:owner/:repo/fact', async (req, res) => {
  try {
    const { fact } = req.body;
    if (!fact) return res.status(400).json({ error: 'fact is required' });
    const facts = await addFact(req.params.owner, req.params.repo, fact);
    res.json({ success: true, totalFacts: facts.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/project/:owner/:repo/summary', async (req, res) => {
  try {
    const { summary } = req.body;
    if (!summary) return res.status(400).json({ error: 'summary is required' });
    await updateSummary(req.params.owner, req.params.repo, summary);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
