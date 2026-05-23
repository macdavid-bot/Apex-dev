export function analyzeFailure(error) {
  return {
    detected: true,
    type: error?.type || 'unknown',
    message: error?.message || 'Unknown failure detected',
    analyzedAt: new Date().toISOString()
  };
}
