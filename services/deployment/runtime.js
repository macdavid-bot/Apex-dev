import { executeCommand } from '../shell/runtime.js';

export async function deployDockerCompose(cwd) {
  return executeCommand('docker', ['compose', 'up', '-d'], cwd);
}

export async function restartPM2(service) {
  return executeCommand('pm2', ['restart', service]);
}

export async function checkPM2Status() {
  return executeCommand('pm2', ['status']);
}
