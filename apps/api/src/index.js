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
import gitRoutes from './routes/git.js';
import validationEngineRoutes from './routes/validation-engine.js';
import deploymentRoutes from './routes/deployment.js';
import terminalRoutes from './routes/terminal.js';
import repairRoutes from './routes/repair.js';

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
app.use('/git', gitRoutes);
app.use('/validation-engine', validationEngineRoutes);
app.use('/deployment', deploymentRoutes);
app.use('/terminal', terminalRoutes);
app.use('/repair', repairRoutes);

app.listen(PORT, () => {
  console.log(`Apex Dev API running on port ${PORT}`);
});
