export function createWorkspace(name) {
  return {
    workspace: name,
    status: 'created',
    createdAt: new Date().toISOString()
  };
}
