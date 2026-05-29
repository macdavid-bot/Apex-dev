import express from 'express';
import { runTask } from '../../../../services/orchestrator/runtime.js';
import { assembleContext } from '../../../../services/context/assembler.js';
import { runDeepSeekChat } from '../../../../services/ai/deepseek-runtime.js';

const router = express.Router();

// In-memory conversation store: conversationId -> Message[]
const conversations = new Map();

const SYSTEM_PROMPT = `You are Apex Dev, an autonomous engineering assistant. You help engineers with:
- Code review, analysis, and refactoring
- Repository exploration and understanding
- Deployment planning and VPS operations
- Workflow orchestration and automation
- Bug diagnosis and repair
- Shell command guidance

Be concise, technical, and actionable. When suggesting commands or code, format them clearly.`;

router.post('/chat', async (req, res) => {
  const { message, conversationId } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'message is required' });
  }

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'DEEPSEEK_API_KEY is not configured' });
  }

  // Get or create conversation history
  const id = conversationId || Math.random().toString(36).slice(2);
  if (!conversations.has(id)) {
    conversations.set(id, [{ role: 'system', content: SYSTEM_PROMPT }]);
  }

  const history = conversations.get(id);
  history.push({ role: 'user', content: message });

  try {
    const result = await runDeepSeekChat({
      apiKey,
      messages: history
    });

    const reply = result.choices?.[0]?.message?.content;
    if (!reply) throw new Error('Empty response from DeepSeek');

    history.push({ role: 'assistant', content: reply });

    res.json({ response: reply, conversationId: id });
  } catch (err) {
    console.error('DeepSeek error:', err.message);
    // Remove the failed user message so history stays clean
    history.pop();
    res.status(500).json({ error: err.message });
  }
});

router.post('/run', async (req, res) => {
  const result = await runTask(req.body.task, req.body.context || {});
  res.json(result);
});

router.post('/context', (req, res) => {
  const context = assembleContext(req.body);
  res.json(context);
});

export default router;
