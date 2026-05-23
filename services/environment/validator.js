export function validateEnvironment(env = {}) {
  const missing = [];

  if (!env.PORT) missing.push('PORT');

  return {
    valid: missing.length === 0,
    missing,
    checkedAt: new Date().toISOString()
  };
}
