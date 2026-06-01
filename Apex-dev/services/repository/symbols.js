export function extractSymbols(file) {
  const matches = file.content.match(/function\s+\w+|class\s+\w+/g) || [];

  return {
    path: file.path,
    symbols: matches,
  };
}
