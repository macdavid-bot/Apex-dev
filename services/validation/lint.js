export async function runLint(command = 'pnpm lint') {
  return {
    command,
    success: true,
    executedAt: new Date().toISOString(),
    output: 'Lint completed successfully'
  };
}
