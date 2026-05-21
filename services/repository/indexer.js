export function buildRepositoryIndex(files = []) {
  return files.map((file) => ({
    path: file.path,
    size: file.content.length,
    keywords: file.content
      .split(/\W+/)
      .filter(Boolean)
      .slice(0, 50),
  }));
}
