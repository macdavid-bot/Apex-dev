const approvals = new Map(); // id -> approval object

export function createApproval({ title, description, action, requestedBy } = {}) {
  const id = Math.random().toString(36).slice(2);
  const approval = {
    id,
    title: title || 'Action Approval Required',
    description: description || '',
    action: action || {},
    requestedBy: requestedBy || 'apex-ai',
    status: 'pending',
    createdAt: new Date().toISOString(),
    resolvedAt: null
  };
  approvals.set(id, approval);
  return approval;
}

export function getApprovals() {
  return [...approvals.values()].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export function approveAction(id) {
  const approval = approvals.get(id);
  if (!approval) return null;
  approval.status = 'approved';
  approval.resolvedAt = new Date().toISOString();
  return approval;
}

export function rejectAction(id) {
  const approval = approvals.get(id);
  if (!approval) return null;
  approval.status = 'rejected';
  approval.resolvedAt = new Date().toISOString();
  return approval;
}
