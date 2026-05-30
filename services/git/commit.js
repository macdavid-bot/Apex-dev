import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function createCommit(message, files = [], cwd = process.cwd()) {
  const targets = files.length > 0 ? files.map(f => `"${f}"`).join(' ') : '.';
  await execAsync(`git add ${targets}`, { cwd, timeout: 15000 });
  const { stdout } = await execAsync(
    `git commit -m "${message.replace(/"/g, '\\"')}"`,
    { cwd, timeout: 15000 }
  );
  return {
    message,
    files,
    status: 'committed',
    output: stdout.trim(),
    createdAt: new Date().toISOString()
  };
}

export async function getStatus(cwd = process.cwd()) {
  const { stdout } = await execAsync('git status --short', { cwd, timeout: 10000 });
  return { status: stdout.trim() };
}
