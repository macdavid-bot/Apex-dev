import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function createBranch(name, cwd = process.cwd()) {
  const { stdout } = await execAsync(`git checkout -b "${name}"`, { cwd, timeout: 15000 });
  return { branch: name, status: 'created', createdAt: new Date().toISOString(), output: stdout.trim() };
}

export async function checkoutBranch(name, cwd = process.cwd()) {
  const { stdout } = await execAsync(`git checkout "${name}"`, { cwd, timeout: 15000 });
  return { branch: name, status: 'checked-out', output: stdout.trim() };
}

export async function listBranches(cwd = process.cwd()) {
  const { stdout } = await execAsync('git branch -a', { cwd, timeout: 10000 });
  return { branches: stdout.trim().split('\n').map(b => b.trim()) };
}
