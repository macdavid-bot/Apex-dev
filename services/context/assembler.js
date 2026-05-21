export function assembleContext({ repository, symbols, snippets }) {
  return {
    repository,
    symbols,
    snippets,
    assembledAt: new Date().toISOString()
  };
}
