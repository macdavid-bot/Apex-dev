export function createPipeline(task) {
  return {
    task,
    steps: [
      'search',
      'assemble-context',
      'execute',
      'validate',
      'repair-if-needed'
    ],
    status: 'ready',
    createdAt: new Date().toISOString()
  };
}
