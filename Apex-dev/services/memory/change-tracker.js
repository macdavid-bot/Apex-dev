const changes = [];

export function trackChange(file, type) {
  changes.push({
    file,
    type,
    trackedAt: new Date().toISOString()
  });

  return changes.length;
}

export function getTrackedChanges() {
  return changes;
}
