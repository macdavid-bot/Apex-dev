import express from 'express';
import { saveRepositoryMetadata, getRepositoryMetadata } from '../../../../services/memory/repository-cache.js';
import { rememberSymbol, recallSymbol } from '../../../../services/memory/symbol-memory.js';
import { trackChange, getTrackedChanges } from '../../../../services/memory/change-tracker.js';
import { storeContext, getContexts } from '../../../../services/memory/context-store.js';

const router = express.Router();

router.post('/repository', (req, res) => {
  const result = saveRepositoryMetadata(req.body.repo, req.body.metadata);

  res.json(result);
});

router.get('/repository/:repo', (req, res) => {
  const result = getRepositoryMetadata(req.params.repo);

  res.json(result);
});

router.post('/symbol', (req, res) => {
  const result = rememberSymbol(req.body.symbol, req.body.location);

  res.json(result);
});

router.get('/symbol/:symbol', (req, res) => {
  const result = recallSymbol(req.params.symbol);

  res.json(result);
});

router.post('/change', (req, res) => {
  const result = trackChange(req.body.file, req.body.type);

  res.json({ tracked: true, total: result });
});

router.get('/changes', (req, res) => {
  res.json(getTrackedChanges());
});

router.post('/context', (req, res) => {
  const result = storeContext(req.body.context);

  res.json({ stored: true, total: result });
});

router.get('/contexts', (req, res) => {
  res.json(getContexts());
});

export default router;
