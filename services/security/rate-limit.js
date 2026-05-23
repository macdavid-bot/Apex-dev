const requests = new Map();

export function trackRequest(key) {
  const current = requests.get(key) || 0;

  requests.set(key, current + 1);

  return {
    key,
    total: requests.get(key),
    trackedAt: new Date().toISOString()
  };
}
