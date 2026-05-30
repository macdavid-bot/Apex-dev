import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function cloneRepository(repositoryUrl, workspace) {
  if (!repositoryUrl) throw new Error('repositoryUrl is required');
  if (!workspace) throw new Error('workspace path is required');

  const { stdout, stderr } = await execAsync(
    `git clone "${repositoryUrl}" "${workspace}"`,
    { timeout: 120000 }
  );

  return {
    success: true,
    repositoryUrl,
    workspace,
    clonedAt: new Date().toISOString(),
    output: stdout || stderr
  };
}
