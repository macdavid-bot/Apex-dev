import { NodeSSH } from 'node-ssh';

/**
 * Automatically detect required secrets from a repo and request them from the user.
 */

// Common secret patterns found in .env.example, README, and config files
const SECRET_PATTERNS = [
  { key: 'DATABASE_URL', label: 'Database URL', required: true, example: 'postgresql://user:pass@localhost:5432/dbname' },
  { key: 'JWT_SECRET', label: 'JWT Secret', required: true, example: 'a-long-random-string-64-chars' },
  { key: 'DEEPSEEK_API_KEY', label: 'DeepSeek API Key', required: false, example: 'sk-...' },
  { key: 'OPENAI_API_KEY', label: 'OpenAI API Key', required: false, example: 'sk-...' },
  { key: 'ANTHROPIC_API_KEY', label: 'Anthropic API Key', required: false, example: 'sk-ant-...' },
  { key: 'GITHUB_TOKEN', label: 'GitHub Token', required: false, example: 'ghp_...' },
  { key: 'STRIPE_SECRET_KEY', label: 'Stripe Secret Key', required: false, example: 'sk_test_...' },
  { key: 'STRIPE_PUBLISHABLE_KEY', label: 'Stripe Publishable Key', required: false, example: 'pk_test_...' },
  { key: 'SENDGRID_API_KEY', label: 'SendGrid API Key', required: false, example: 'SG.xxx' },
  { key: 'TWILIO_ACCOUNT_SID', label: 'Twilio Account SID', required: false, example: 'AC...' },
  { key: 'TWILIO_AUTH_TOKEN', label: 'Twilio Auth Token', required: false, example: '...' },
  { key: 'AWS_ACCESS_KEY_ID', label: 'AWS Access Key ID', required: false, example: 'AKIA...' },
  { key: 'AWS_SECRET_ACCESS_KEY', label: 'AWS Secret Access Key', required: false, example: '...' },
  { key: 'REDIS_URL', label: 'Redis URL', required: false, example: 'redis://localhost:6379' },
  { key: 'MONGODB_URI', label: 'MongoDB URI', required: false, example: 'mongodb://localhost:27017/db' },
  { key: 'FIREBASE_API_KEY', label: 'Firebase API Key', required: false, example: '...' },
  { key: 'GOOGLE_CLIENT_ID', label: 'Google Client ID', required: false, example: '...' },
  { key: 'GOOGLE_CLIENT_SECRET', label: 'Google Client Secret', required: false, example: '...' },
  { key: 'CLOUDINARY_URL', label: 'Cloudinary URL', required: false, example: 'cloudinary://...' },
  { key: 'S3_BUCKET', label: 'S3 Bucket', required: false, example: 'my-bucket' },
  { key: 'APP_SECRET', label: 'App Secret', required: false, example: 'a-long-random-string' },
  { key: 'SESSION_SECRET', label: 'Session Secret', required: false, example: 'a-long-random-string' },
  { key: 'ENCRYPTION_KEY', label: 'Encryption Key', required: false, example: '...' },
  { key: 'WEBHOOK_SECRET', label: 'Webhook Secret', required: false, example: '...' },
  { key: 'SLACK_BOT_TOKEN', label: 'Slack Bot Token', required: false, example: 'xoxb-...' },
  { key: 'DISCORD_BOT_TOKEN', label: 'Discord Bot Token', required: false, example: '...' },
  { key: 'MAPBOX_ACCESS_TOKEN', label: 'Mapbox Access Token', required: false, example: 'pk...' },
  { key: 'ALGOLIA_API_KEY', label: 'Algolia API Key', required: false, example: '...' },
  { key: 'ALGOLIA_APP_ID', label: 'Algolia App ID', required: false, example: '...' },
];

/**
 * Scan a repo on a VPS for required secrets by reading .env.example, package.json, and config files.
 */
export async function detectRequiredSecrets(ssh, targetDir) {
  const detected = [];
  const missing = [];
  const found = [];

  // 1. Read .env.example
  const envExample = await ssh.execCommand(`cat ${targetDir}/.env.example 2>/dev/null || cat ${targetDir}/.env.sample 2>/dev/null || echo "NOT_FOUND"`);
  if (!envExample.stdout.includes('NOT_FOUND')) {
    for (const pattern of SECRET_PATTERNS) {
      if (envExample.stdout.includes(pattern.key)) {
        detected.push({ ...pattern, source: '.env.example' });
      }
    }
  }

  // 2. Read .env file if exists
  const envFile = await ssh.execCommand(`cat ${targetDir}/.env 2>/dev/null || echo "NOT_FOUND"`);
  if (!envFile.stdout.includes('NOT_FOUND')) {
    for (const pattern of SECRET_PATTERNS) {
      if (envFile.stdout.includes(pattern.key)) {
        const line = envFile.stdout.split('\n').find(l => l.startsWith(pattern.key + '='));
        const value = line ? line.split('=').slice(1).join('=').trim() : '';
        if (value && value !== 'your_value_here' && value !== 'changeme' && value !== 'placeholder') {
          found.push({ ...pattern, value: value.slice(0, 10) + '...', source: '.env' });
        } else {
          missing.push({ ...pattern, source: '.env' });
        }
      }
    }
  }

  // 3. Scan package.json for clues
  const pkg = await ssh.execCommand(`cat ${targetDir}/package.json 2>/dev/null || echo "NOT_FOUND"`);
  if (!pkg.stdout.includes('NOT_FOUND')) {
    const pkgStr = pkg.stdout;
    const deps = pkgStr.includes('dependencies') ? pkgStr.split('dependencies')[1] : '';
    if (deps.includes('stripe')) detected.push({ key: 'STRIPE_SECRET_KEY', label: 'Stripe Secret Key', required: false, source: 'package.json', reason: 'stripe dependency detected' });
    if (deps.includes('openai')) detected.push({ key: 'OPENAI_API_KEY', label: 'OpenAI API Key', required: false, source: 'package.json', reason: 'openai dependency detected' });
    if (deps.includes('@anthropic')) detected.push({ key: 'ANTHROPIC_API_KEY', label: 'Anthropic API Key', required: false, source: 'package.json', reason: 'anthropic dependency detected' });
    if (deps.includes('firebase')) detected.push({ key: 'FIREBASE_API_KEY', label: 'Firebase API Key', required: false, source: 'package.json', reason: 'firebase dependency detected' });
    if (deps.includes('pg') || deps.includes('sequelize') || deps.includes('prisma')) detected.push({ key: 'DATABASE_URL', label: 'Database URL', required: true, source: 'package.json', reason: 'database dependency detected' });
    if (deps.includes('redis')) detected.push({ key: 'REDIS_URL', label: 'Redis URL', required: false, source: 'package.json', reason: 'redis dependency detected' });
    if (deps.includes('mongodb')) detected.push({ key: 'MONGODB_URI', label: 'MongoDB URI', required: false, source: 'package.json', reason: 'mongodb dependency detected' });
    if (deps.includes('jsonwebtoken') || deps.includes('jwt')) detected.push({ key: 'JWT_SECRET', label: 'JWT Secret', required: true, source: 'package.json', reason: 'JWT dependency detected' });
    if (deps.includes('passport')) detected.push({ key: 'SESSION_SECRET', label: 'Session Secret', required: true, source: 'package.json', reason: 'passport auth detected' });
  }

  // 4. Scan README for clues
  const readme = await ssh.execCommand(`cat ${targetDir}/README.md 2>/dev/null || cat ${targetDir}/README.markdown 2>/dev/null || echo "NOT_FOUND"`);
  if (!readme.stdout.includes('NOT_FOUND')) {
    const readmeStr = readme.stdout.toLowerCase();
    for (const pattern of SECRET_PATTERNS) {
      if (readmeStr.includes(pattern.key.toLowerCase()) && !detected.find(d => d.key === pattern.key)) {
        detected.push({ ...pattern, source: 'README.md' });
      }
    }
  }

  // Deduplicate detected
  const allDetected = [...new Map([...detected, ...missing].map(d => [d.key, d])).values()];

  // Determine which ones are truly missing
  const trulyMissing = allDetected.filter(d => !found.find(f => f.key === d.key));

  return {
    detected: allDetected,
    found,
    missing: trulyMissing,
    required: trulyMissing.filter(m => m.required),
    optional: trulyMissing.filter(m => !m.required),
  };
}

/**
 * Build a user-friendly request message for missing secrets.
 */
export function buildSecretRequestMessage(detected) {
  const required = detected.filter(d => d.required);
  const optional = detected.filter(d => !d.required);

  let msg = '';
  if (required.length > 0) {
    msg += `**Required secrets** (the app won't work without these):\n`;
    for (const s of required) {
      msg += `- **${s.label}** (${s.key})${s.example ? ` — example: \`${s.example}\`` : ''}\n`;
    }
  }
  if (optional.length > 0) {
    msg += `\n**Optional secrets** (for extra features):\n`;
    for (const s of optional) {
      msg += `- ${s.label} (${s.key})${s.example ? ` — example: \`${s.example}\`` : ''}\n`;
    }
  }

  return msg || 'No secrets detected for this app.';
}
