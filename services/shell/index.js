import { exec } from 'child_process';

export function runShellCommand(command, cwd) {
  return new Promise((resolve) => {
    const opts = { timeout: 30000 };
    if (cwd) opts.cwd = cwd;

    exec(command, opts, (error, stdout, stderr) => {
      resolve({
        success: !error,
        stdout: stdout || '',
        stderr: stderr || '',
        error: error ? error.message : null,
        exitCode: error?.code ?? 0
      });
    });
  });
}
