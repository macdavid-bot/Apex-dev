import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function deployDockerService(service, cwd = process.cwd()) {
  try {
    const target = service || '';
    const { stdout, stderr } = await execAsync(
      `docker compose up -d --build ${target}`.trim(),
      { cwd, timeout: 180000 }
    );
    return {
      success: true,
      service: service || 'all',
      output: stdout || stderr,
      deployedAt: new Date().toISOString()
    };
  } catch (err) {
    return {
      success: false,
      service: service || 'all',
      error: err.message,
      deployedAt: new Date().toISOString()
    };
  }
}

export async function stopDockerService(service, cwd = process.cwd()) {
  try {
    const { stdout, stderr } = await execAsync(
      `docker compose stop ${service || ''}`.trim(),
      { cwd, timeout: 30000 }
    );
    return { success: true, service, output: stdout || stderr };
  } catch (err) {
    return { success: false, service, error: err.message };
  }
}

export async function getDockerStatus(cwd = process.cwd()) {
  try {
    const { stdout } = await execAsync('docker compose ps --format json', { cwd, timeout: 10000 });
    return { success: true, containers: JSON.parse(`[${stdout.trim().split('\n').join(',')}]`) };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
