export function explainShellResult(result) {
  return {
    success: result.success,
    summary: result.success
      ? 'Command executed successfully'
      : 'Command execution failed',
    generatedAt: new Date().toISOString()
  };
}
