export function createStream(command) {
  return {
    command,
    status: 'streaming',
    startedAt: new Date().toISOString()
  };
}
