import { spawn } from 'child_process';

export function executeCommand(command, args = [], cwd = process.cwd()) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      shell: true
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      resolve({
        success: code === 0,
        code,
        stdout,
        stderr
      });
    });

    child.on('error', reject);
  });
}
