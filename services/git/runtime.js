import simpleGit from 'simple-git';

export async function cloneRepository(repository, target) {
  const git = simpleGit();

  await git.clone(repository, target);

  return {
    success: true,
    repository,
    target,
    clonedAt: new Date().toISOString()
  };
}

export async function createBranch(workspace, branch) {
  const git = simpleGit(workspace);

  await git.checkoutLocalBranch(branch);

  return {
    success: true,
    branch,
    workspace
  };
}

export async function commitChanges(workspace, message) {
  const git = simpleGit(workspace);

  await git.add('.');

  const result = await git.commit(message);

  return result;
}
