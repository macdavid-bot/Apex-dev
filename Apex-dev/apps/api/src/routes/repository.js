import express from 'express';
import { searchRepository } from '../../../../services/repository/search.js';
import { buildRepositoryIndex } from '../../../../services/repository/indexer.js';

const router = express.Router();

router.post('/search', (req, res) => {
  const { query, files } = req.body;
  const results = searchRepository(query, files || []);

  res.json(results);
});

router.post('/index', (req, res) => {
  const index = buildRepositoryIndex(req.body.files || []);

  res.json(index);
});

export default router;
