export function createLifecycle(task) {
  return {
    task,
    stages: [
      'received',
      'analyzing',
      'planning',
      'approval',
      'executing',
      'validating',
      'completed'
    ],
    currentStage: 'received',
    createdAt: new Date().toISOString()
  };
}
