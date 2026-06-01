export async function installDependencies(manager = 'pnpm') {
  return {
    manager,
    status: 'completed',
    installedAt: new Date().toISOString(),
    output: `${manager} install completed`
  };
}
