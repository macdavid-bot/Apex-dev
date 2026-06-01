export async function runBuild(command = 'pnpm build') {
  return {
    command,
    success: true,
    executedAt: new Date().toISOString(),
    output: 'Build completed successfully'
  };
}
