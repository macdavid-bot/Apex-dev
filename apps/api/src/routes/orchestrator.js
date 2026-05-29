import express from 'express';
import { runTask } from '../../../../services/orchestrator/runtime.js';
import { assembleContext } from '../../../../services/context/assembler.js';
import { runDeepSeekChat } from '../../../../services/ai/deepseek-runtime.js';

const router = express.Router();

// In-memory conversation store: conversationId -> Message[]
const conversations = new Map();

const BASE_SYSTEM = `You are Apex Dev, an autonomous engineering assistant specialized in:
- Reading and editing code in any language
- Repository exploration and feature development
- Deployment planning and VPS/server automation
- Shell command generation and execution guidance
- Bug diagnosis and repair

Guidelines:
- Be concise and technical. No fluff.
- When writing code or commands, always use fenced code blocks with the language tag.
- When asked to edit a file, output ONLY the complete new file content inside a code block — no explanation before the code, no partial diffs unless asked.
- When asked to run commands on a VPS, list them one per line so they can be executed individually.
- If you need to see a specific file to help, say: "Please load the file: <path>" and the user can fetch it.
- Never hallucinate file contents. Only reason about files the user has shared with you.`;

router.post('/chat', async (req, res) => {
  const { message, conversationId, repoContext, fileContext } = req.body;

  if (!message) return res.status(400).json({ error: 'message is required' });

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'DEEPSEEK_API_KEY is not configured' });

  const id = conversationId || Math.random().toString(36).slice(2);

  if (!conversations.has(id)) {
    // Build system prompt — inject repo context once at conversation start
    let systemContent = BASE_SYSTEM;
    if (repoContext) {
      systemContent += `\n\n---\nLoaded repository: ${repoContext.owner}/${repoContext.repo} (branch: ${repoContext.branch})\n`;
      if (repoContext.description) systemContent += `Description: ${repoContext.description}\n`;
      if (repoContext.language)    systemContent += `Primary language: ${repoContext.language}\n`;
      systemContent += `\nFile tree (${repoContext.fileCount} files):\n${repoContext.files.map(f => f.path).join('\n')}\n`;
      if (repoContext.readme) systemContent += `\nREADME (excerpt):\n${repoContext.readme}\n`;
      systemContent += `---`;
    }
    conversations.set(id, [{ role: 'system', content: systemContent }]);
  }

  const history = conversations.get(id);

  // If a file was loaded for context, inject it as a user-visible system note
  let userContent = message;
  if (fileContext) {
    userContent = `[File loaded: ${fileContext.path}]\n\`\`\`\n${fileContext.content}\n\`\`\`\n\n${message}`;
  }

  history.push({ role: 'user', content: userContent });

  try {
    const result = await runDeepSeekChat({ apiKey, messages: history });
    const reply = result.choices?.[0]?.message?.content;
    if (!reply) throw new Error('Empty response from DeepSeek');

    history.push({ role: 'assistant', content: reply });
    res.json({ response: reply, conversationId: id });
  } catch (err) {
    console.error('DeepSeek error:', err.message);
    history.pop();
    res.status(500).json({ error: err.message });
  }
});

// Inject a new repo context into an existing conversation
router.post('/context/repo', (req, res) => {
  const { conversationId, repoContext } = req.body;
  const history = conversations.get(conversationId);
  if (!history) return res.status(404).json({ error: 'Conversation not found' });

  const summary = `[Repository context updated: ${repoContext.owner}/${repoContext.repo}]\nFiles: ${repoContext.files.map(f => f.path).join(', ')}`;
  history.push({ role: 'user', content: summary });
  history.push({ role: 'assistant', content: `Got it. I now have context for ${repoContext.owner}/${repoContext.repo} with ${repoContext.fileCount} files. What would you like to do?` });

  res.json({ success: true });
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
