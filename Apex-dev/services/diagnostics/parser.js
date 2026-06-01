export function parseDiagnostics(stderr = '') {
  return {
    hasErrors: stderr.length > 0,
    summary: stderr || 'No diagnostics found',
    parsedAt: new Date().toISOString()
  };
}
