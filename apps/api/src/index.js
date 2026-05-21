import express from 'express';
import cors from 'cors';
import shellRoutes from './routes/shell.js';
import approvalRoutes from './routes/approval.js';
import validationRoutes from './routes/validation.js';
import workspaceRoutes from './routes/workspace.js';
import repositoryRoutes from './routes/repository.js';
import contextRoutes from './routes/context.js';
import orchestratorRoutes from './routes/orchestrator.js';
import workflowRoutes from './routes/workflow.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Apex Dev API',
  });
});

app.use('/shell', shellRoutes);
app.use('/approvals', approvalRoutes);
app.use('/validation', validationRoutes);
app.use('/workspace', workspaceRoutes);
app.use('/repository', repositoryRoutes);
app.use('/context', contextRoutes);
app.use('/orchestrator', orchestratorRoutes);
app.use('/workflow', workflowRoutes);

app.listen(PORT, () => {
  console.log(`Apex Dev API running on port ${PORT}`);
});
