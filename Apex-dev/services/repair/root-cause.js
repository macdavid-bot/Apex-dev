export function detectRootCause(logs = '') {
  return {
    detected: logs.length > 0,
    rootCause: logs || 'No root cause identified',
    detectedAt: new Date().toISOString()
  };
}
