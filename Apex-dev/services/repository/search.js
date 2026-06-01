export function searchRepository(query, files = []) {
  const results = [];

  for (const file of files) {
    if (file.path.includes(query) || file.content.includes(query)) {
      results.push({
        path: file.path,
        matched: query,
      });
    }
  }

  return {
    query,
    total: results.length,
    results,
  };
}
