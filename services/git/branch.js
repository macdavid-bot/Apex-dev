export function createBranch(name) {
  return {
    branch: name,
    status: 'created',
    createdAt: new Date().toISOString()
  };
}
