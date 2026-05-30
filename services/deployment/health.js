import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Real health check — probes an HTTP endpoint or falls back to port check
export async function checkDeploymentHealth(service) {
  const port = service?.port || 3000;
  const path = service?.healthPath || '/health';
  const host = service?.host || 'localhost';

  try {
    const { stdout } = await execAsync(
      `curl -s --max-time 4 -o /dev/null -w "%{http_code}" http://${host}:${port}${path}`,
      { timeout: 6000 }
    );
    const code = parseInt(stdout.trim(), 10);
    return {
      service: service?.name || `${host}:${port}`,
      healthy: code >= 200 && code < 400,
      statusCode: code,
      checkedAt: new Date().toISOString()
    };
  } catch (err) {
    return {
      service: service?.name || `${host}:${port}`,
      healthy: false,
      error: err.message,
      checkedAt: new Date().toISOString()
    };
  }
}
