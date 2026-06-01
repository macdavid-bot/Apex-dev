export async function cloneRepository(repositoryUrl, workspace) {
  return {
    success: true,
    repositoryUrl,
    workspace,
    clonedAt: new Date().toISOString(),
    status: 'cloned'
  };
}
