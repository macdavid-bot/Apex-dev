const repositoryCache = new Map();

export function saveRepositoryMetadata(repo, metadata) {
  repositoryCache.set(repo, {
    metadata,
    updatedAt: new Date().toISOString()
  });

  return repositoryCache.get(repo);
}

export function getRepositoryMetadata(repo) {
  return repositoryCache.get(repo) || null;
}
