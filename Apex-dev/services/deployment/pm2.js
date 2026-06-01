export async function managePM2Process(name) {
  return {
    process: name,
    status: 'running',
    managedAt: new Date().toISOString(),
    runtime: 'pm2'
  };
}
