// In-memory workflow store — tracks AI-initiated and user-triggered workflows.
// Capped at 200 entries (newest first). Data lives for the process lifetime.

const workflows = [];
const MAX = 200;

export function addWorkflow({ title, description = '', status = 'running', type = 'task' } = {}) {
  const id = Math.random().toString(36).slice(2);
  const wf = {
    id,
    title: title || 'Workflow',
    description,
    status,
    type,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  workflows.unshift(wf);
  if (workflows.length > MAX) workflows.pop();
  return wf;
}

export function updateWorkflow(id, updates) {
  const wf = workflows.find(w => w.id === id);
  if (!wf) return null;
  Object.assign(wf, { ...updates, updatedAt: new Date().toISOString() });
  return wf;
}

export function getWorkflows() {
  return workflows;
}
