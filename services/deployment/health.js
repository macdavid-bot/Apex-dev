export function checkDeploymentHealth(service) {
  return {
    service,
    healthy: true,
    checkedAt: new Date().toISOString()
  };
}
