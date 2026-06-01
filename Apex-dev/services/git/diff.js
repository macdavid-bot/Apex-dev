export function generateDiff(before, after) {
  return {
    changed: before !== after,
    before,
    after,
    generatedAt: new Date().toISOString()
  };
}
