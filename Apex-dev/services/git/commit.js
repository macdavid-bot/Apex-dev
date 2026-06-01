export function createCommit(message, files = []) {
  return {
    message,
    files,
    status: 'staged',
    createdAt: new Date().toISOString()
  };
}
