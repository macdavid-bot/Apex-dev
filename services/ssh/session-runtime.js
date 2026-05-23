export function validateSessionContext({ sessionName, taskType }) {
  if (!sessionName) {
    return {
      success: false,
      error: 'No active session selected.'
    };
  }

  if (!taskType) {
    return {
      success: false,
      error: 'No task type provided.'
    };
  }

  return {
    success: true,
    sessionName,
    taskType,
    validatedAt: new Date().toISOString()
  };
}

export function bindSessionWorkspace({ sessionName, workspace }) {
  return {
    sessionName,
    workspace,
    bound: true,
    createdAt: new Date().toISOString()
  };
}
