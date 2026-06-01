import { exec } from 'child_process';

export function runShellCommand(command) {
  return new Promise((resolve) => {
    exec(command, (error, stdout, stderr) => {
      resolve({
        success: !error,
        stdout,
        stderr,
        error: error ? error.message : null,
      });
    });
  });
}
