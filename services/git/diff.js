import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function generateDiff(before, after, cwd = process.cwd()) {
  let ref = 'HEAD';
  if (before && after) ref = `${before}..${after}`;
  else if (before) ref = `${before}..HEAD`;

  const { stdout } = await execAsync(`git diff ${ref}`, { cwd, timeout: 15000 });
  return { diff: stdout, ref, generatedAt: new Date().toISOString() };
}

export async function diffUnstaged(cwd = process.cwd()) {
  const { stdout } = await execAsync('git diff', { cwd, timeout: 10000 });
  return { diff: stdout };
}

export async function pushBranch(branch, remote = 'origin', cwd = process.cwd()) {
  const { stdout, stderr } = await execAsync(
    `git push "${remote}" "${branch}"`,
    { cwd, timeout: 30000 }
  );
  return { success: true, branch, remote, output: stdout || stderr };
}
