const required = [
  'DEEPSEEK_API_KEY',
  'GITHUB_TOKEN',
  'DATABASE_URL',
  'JWT_SECRET'
];

export function validateEnvironmentRuntime() {
  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(`Missing environment variables: ${missing.join(', ')}`);
  }

  return {
    success: true,
    validatedAt: new Date().toISOString()
  };
}
