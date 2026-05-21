import express from 'express';
import { loadTargetedContext } from '../../../../services/repository/context-loader.js';
import { extractSymbols } from '../../../../services/repository/symbols.js';

const router = express.Router();

router.post('/load', (req, res) => {
  const { file, startLine, endLine } = req.body;

  const context = loadTargetedContext(file, startLine, endLine);

  res.json(context);
});

router.post('/symbols', (req, res) => {
  const symbols = extractSymbols(req.body.file);

  res.json(symbols);
});

export default router;
