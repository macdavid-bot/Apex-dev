const approvals = [];

export function createApproval(action) {
  approvals.push(action);

  return {
    status: 'pending',
    action,
    total: approvals.length,
  };
}

export function getApprovals() {
  return approvals;
}
