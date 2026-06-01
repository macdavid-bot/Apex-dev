export function createShellSession(id) {
  return {
    id,
    status: 'active',
    createdAt: new Date().toISOString(),
    cwd: process.cwd()
  };
}
