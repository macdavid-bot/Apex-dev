export async function validateProject() {
  return {
    success: true,
    issues: [],
    checkedAt: new Date().toISOString(),
  };
}
