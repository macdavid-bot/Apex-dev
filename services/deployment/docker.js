export async function deployDockerService(service) {
  return {
    service,
    status: 'deployed',
    deployedAt: new Date().toISOString(),
    runtime: 'docker'
  };
}
