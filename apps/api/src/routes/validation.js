import express from 'express';
import { runValidation } from '../../../../services/validator/runtime.js';

const router = express.Router();

router.get('/run', async (req, res) => {
  const results = await runValidation();
  res.json(results);
});

export default router;
