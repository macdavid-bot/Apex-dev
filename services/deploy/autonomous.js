import { NodeSSH } from 'node-ssh';
import { buildNginxConfig } from '../domains/manager.js';

/**
 * Autonomous deployment orchestrator.
 * Handles the full end-to-end deployment: clone → install → config → PM2 → domain → SSL
 */

const MAX_EXEC_TIME = 120000; // 2 min per command

async function sshExec(ssh, command, cwd = '', timeout = MAX_EXEC_TIME) {
  const opts = cwd ? { cwd, options: { pty: true } } : { options: { pty: true } };
  const r = await ssh.execCommand(command, opts);
  return { stdout: r.stdout, stderr: r.stderr, code: r.code };
}

/**
 * Auto-deploy an app from GitHub to a VPS server.
 * @param {Object} server - VPS server object (host, port, username, private_key)
 * @param {Object} opts
 * @param {string} opts.repoUrl - GitHub repo URL (e.g., https://github.com/user/repo.git)
 * @param {string} opts.branch - Branch to deploy (default: main)
 * @param {string} opts.deployDir - Target directory on VPS (default: /var/www/app-name)
 * @param {string} opts.domain - Domain to configure (optional)
 * @param {number} opts.appPort - Internal app port (default: 3000)
 * @param {boolean} opts.ssl - Enable SSL (default: true)
 * @param {Object} opts.envVars - Key-value env vars to write to .env
 * @param {boolean} opts.usePm2 - Use PM2 to keep app always-on (default: true)
 * @param {string} opts.pm2Name - PM2 process name (default: derived from repo)
 * @param {boolean} opts.setupDb - Auto-setup PostgreSQL on VPS (default: false)
 * @param {string} opts.dbPassword - DB password for auto-setup (default: generated)
 * @param {string} opts.nodeVersion - Node version to use (default: auto-detect)
 */
export async function autoDeploy(server, opts = {}) {
  const ssh = new NodeSSH();
  const logs = [];
  const log = (msg) => { logs.push(msg); console.log(`[AutoDeploy] ${msg}`); };

  try {
    await ssh.connect({
      host: server.host,
      port: server.port || 22,
      username: server.username,
      privateKey: server.private_key,
      readyTimeout: 15000
    });
    log(`Connected to ${server.host}`);
  } catch (err) {
    return { error: `SSH connection failed: ${err.message}`, logs };
  }

  const {
    repoUrl,
    branch = 'main',
    deployDir,
    domain = '',
    appPort = 3000,
    ssl = true,
    envVars = {},
    usePm2 = true,
    pm2Name,
    setupDb = false,
    dbPassword = generatePassword(16),
    nodeVersion = ''
  } = opts;

  if (!repoUrl) {
    ssh.dispose();
    return { error: 'repoUrl is required', logs };
  }

  // Derive app name from repo URL
  const repoName = repoUrl.split('/').pop().replace(/\.git$/, '');
  const targetDir = deployDir || `/var/www/${repoName}`;
  const processName = pm2Name || repoName;

  const results = [];

  // Step 1: Ensure prerequisites
  log('Checking prerequisites...');
  const prereqs = await ensurePrerequisites(ssh, nodeVersion);
  results.push({ step: 'prerequisites', ...prereqs });
  if (!prereqs.ok) {
    ssh.dispose();
    return { error: `Prerequisites failed: ${prereqs.error}`, logs, results };
  }

  // Step 2: Clone or update repo
  log(`Cloning/updating ${repoUrl} to ${targetDir}...`);
  const clone = await cloneOrUpdateRepo(ssh, repoUrl, branch, targetDir);
  results.push({ step: 'clone', ...clone });
  if (!clone.ok) {
    ssh.dispose();
    return { error: `Clone failed: ${clone.error}`, logs, results };
  }

  // Step 3: Install dependencies
  log('Installing dependencies...');
  const install = await installDependencies(ssh, targetDir);
  results.push({ step: 'install', ...install });
  if (!install.ok) {
    ssh.dispose();
    return { error: `Install failed: ${install.error}`, logs, results };
  }

  // Step 4: Auto-setup DB if requested
  let dbUrl = '';
  if (setupDb) {
    log('Setting up PostgreSQL...');
    const dbSetup = await setupPostgres(ssh, repoName, dbPassword);
    results.push({ step: 'db_setup', ...dbSetup });
    if (dbSetup.ok) {
      dbUrl = `postgresql://${repoName}_user:${dbPassword}@localhost:5432/${repoName}_db`;
      log(`DB URL generated: ${dbUrl}`);
    }
  }

  // Step 5: Write .env file
  const env = { ...envVars };
  if (dbUrl) env.DATABASE_URL = dbUrl;
  if (domain) {
    env.APP_DOMAIN = domain;
    env.APP_PORT = String(appPort);
  }
  // Auto-detect common env vars from package.json if not provided
  const envWrite = await writeEnvFile(ssh, targetDir, env);
  results.push({ step: 'env', ...envWrite });
  log('Environment configured');

  // Step 6: Build if needed
  const build = await runBuild(ssh, targetDir);
  if (build.ran) {
    results.push({ step: 'build', ...build });
    log(`Build completed (exit ${build.code})`);
  }

  // Step 7: PM2 always-on setup
  if (usePm2) {
    log('Setting up PM2 for always-on...');
    const pm2 = await setupPm2(ssh, targetDir, processName, appPort);
    results.push({ step: 'pm2', ...pm2 });
    if (!pm2.ok) {
      ssh.dispose();
      return { error: `PM2 setup failed: ${pm2.error}`, logs, results };
    }
    log('PM2 configured and saved');
  }

  // Step 8: Domain + SSL
  let domResult = null;
  if (domain) {
    log(`Configuring domain ${domain} with ${ssl ? 'SSL' : 'no SSL'}...`);
    domResult = await configureDomainOnServer(ssh, server, domain, appPort, ssl);
    results.push({ step: 'domain', ...domResult });
    log(domResult.ok ? 'Domain configured' : `Domain config had issues: ${domResult.error}`);
  }

  // Step 9: Health check with retry
  log('Waiting for app to be ready...');
  const health = await waitForAppReady(ssh, appPort, usePm2 ? processName : null);
  results.push({ step: 'health', ...health });

  ssh.dispose();

  if (!health.ok) {
    return {
      success: false,
      error: `App not responding on port ${appPort}. PM2: ${health.pm2Status || 'unknown'}, HTTP: ${health.httpStatus || 'failed'}. Check logs: ${logs.slice(-3).join('; ')}`,
      server: server.host,
      repo: repoName,
      dir: targetDir,
      domain: domain || null,
      appPort,
      pm2Name: usePm2 ? processName : null,
      databaseUrl: dbUrl || null,
      logs,
      results
    };
  }

  log('Deployment complete — app is healthy');
  return {
    success: true,
    server: server.host,
    repo: repoName,
    dir: targetDir,
    domain: domain || null,
    appPort,
    pm2Name: usePm2 ? processName : null,
    databaseUrl: dbUrl || null,
    logs,
    results
  };
}

// ── Prerequisite checks ─────────────────────────────────────────────────────

async function ensurePrerequisites(ssh, nodeVersion) {
  const commands = [
    'which git && git --version',
    'which node && node --version',
    'which npm && npm --version',
    'which pm2 && pm2 --version || echo "pm2 not installed"',
    'which nginx && nginx -v || echo "nginx not installed"'
  ];
  const results = [];
  for (const cmd of commands) {
    const r = await ssh.execCommand(cmd);
    results.push({ cmd, ok: r.code === 0, output: (r.stdout || r.stderr).trim().slice(0, 60) });
  }

  const pm2Ok = results.some(r => r.cmd.includes('pm2') && r.ok);
  const nginxOk = results.some(r => r.cmd.includes('nginx') && r.ok);

  if (!pm2Ok) {
    const r = await ssh.execCommand('npm install -g pm2 && pm2 startup');
    results.push({ cmd: 'install pm2 globally', ok: r.code === 0, output: r.stdout?.slice(0, 100) });
  }
  if (!nginxOk) {
    const r = await ssh.execCommand('apt-get update -qq && apt-get install -y nginx certbot python3-certbot-nginx 2>&1 | tail -5');
    results.push({ cmd: 'install nginx', ok: r.code === 0, output: r.stdout?.slice(0, 100) });
  }

  const allOk = results.filter(r => r.cmd.includes('install') || r.cmd.includes('nginx')).every(r => r.ok);
  return { ok: true, results, missing: { pm2: !pm2Ok, nginx: !nginxOk } };
}

// ── Clone / Update ──────────────────────────────────────────────────────────

async function cloneOrUpdateRepo(ssh, repoUrl, branch, targetDir) {
  // Check if directory exists and is a git repo
  const check = await ssh.execCommand(`test -d ${targetDir}/.git && echo exists || echo missing`);
  if (check.stdout.trim() === 'exists') {
    const r = await ssh.execCommand(`cd ${targetDir} && git fetch origin && git checkout ${branch} && git reset --hard origin/${branch}`);
    return { ok: r.code === 0, error: r.code !== 0 ? r.stderr?.slice(0, 200) : null, output: r.stdout?.slice(0, 300) };
  } else {
    const r = await ssh.execCommand(`git clone --depth 1 --branch ${branch} ${repoUrl} ${targetDir}`);
    return { ok: r.code === 0, error: r.code !== 0 ? r.stderr?.slice(0, 200) : null, output: r.stdout?.slice(0, 300) };
  }
}

// ── Install Dependencies ─────────────────────────────────────────────────────

async function installDependencies(ssh, targetDir) {
  // Detect package manager
  const hasPnpm = await ssh.execCommand(`test -f ${targetDir}/pnpm-lock.yaml && echo yes || echo no`);
  const hasYarn = await ssh.execCommand(`test -f ${targetDir}/yarn.lock && echo yes || echo no`);
  const hasNpm = await ssh.execCommand(`test -f ${targetDir}/package-lock.json && echo yes || echo no`);

  let cmd = 'npm install';
  if (hasPnpm.stdout.trim() === 'yes') cmd = 'pnpm install --no-frozen-lockfile';
  else if (hasYarn.stdout.trim() === 'yes') cmd = 'yarn install';
  else if (hasNpm.stdout.trim() === 'yes') cmd = 'npm ci';

  const r = await ssh.execCommand(`cd ${targetDir} && ${cmd}`, { options: { pty: true } });
  return { ok: r.code === 0, error: r.code !== 0 ? r.stderr?.slice(0, 300) : null, output: r.stdout?.slice(0, 300), cmd };
}

// ── Build ───────────────────────────────────────────────────────────────────

async function runBuild(ssh, targetDir) {
  const pkgCheck = await ssh.execCommand(`cd ${targetDir} && cat package.json | grep -q '"build"' && echo yes || echo no`);
  if (pkgCheck.stdout.trim() !== 'yes') return { ran: false };

  const hasPnpm = await ssh.execCommand(`test -f ${targetDir}/pnpm-lock.yaml && echo yes || echo no`);
  const cmd = hasPnpm.stdout.trim() === 'yes' ? 'pnpm build' : 'npm run build';
  const r = await ssh.execCommand(`cd ${targetDir} && ${cmd}`, { options: { pty: true } });
  return { ran: true, ok: r.code === 0, code: r.code, error: r.stderr?.slice(0, 300), output: r.stdout?.slice(0, 300) };
}

// ── PostgreSQL Setup ───────────────────────────────────────────────────────

async function setupPostgres(ssh, appName, password) {
  const dbUser = `${appName}_user`.replace(/[^a-z0-9_]/g, '_').substring(0, 30);
  const dbName = `${appName}_db`.replace(/[^a-z0-9_]/g, '_').substring(0, 30);

  const cmds = [
    'which psql && psql --version || echo "postgresql not installed"',
    `sudo -u postgres psql -c "CREATE USER ${dbUser} WITH PASSWORD '${password}';" 2>&1 || echo "user may exist"`,
    `sudo -u postgres psql -c "CREATE DATABASE ${dbName} OWNER ${dbUser};" 2>&1 || echo "db may exist"`,
    `sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE ${dbName} TO ${dbUser};"`,
  ];

  const results = [];
  for (const cmd of cmds) {
    const r = await ssh.execCommand(cmd);
    results.push({ cmd, ok: r.code === 0 || r.stdout.includes('may exist'), output: (r.stdout || r.stderr).trim().slice(0, 100) });
  }

  const installed = results[0].ok;
  if (!installed) {
    const install = await ssh.execCommand('apt-get update -qq && apt-get install -y postgresql postgresql-contrib 2>&1 | tail -5 && systemctl start postgresql');
    results.push({ cmd: 'install postgresql', ok: install.code === 0, output: install.stdout?.slice(0, 100) });
  }

  return { ok: true, dbUser, dbName, password, results };
}

// ── Write .env ───────────────────────────────────────────────────────────────

async function writeEnvFile(ssh, targetDir, envVars) {
  const envPath = `${targetDir}/.env`;
  const lines = Object.entries(envVars)
    .map(([k, v]) => `${k}=${String(v).replace(/'/g, "'\\''")}`)
    .join('\n');

  const r = await ssh.execCommand(`cat > ${envPath} << 'EOF'\n${lines}\nEOF`);
  return { ok: r.code === 0, path: envPath, vars: Object.keys(envVars) };
}

// ── PM2 Setup ──────────────────────────────────────────────────────────────

async function setupPm2(ssh, targetDir, name, port) {
  // Detect start command
  const pkgCheck = await ssh.execCommand(`cd ${targetDir} && cat package.json`);
  let startCmd = 'node index.js';
  try {
    const pkg = JSON.parse(pkgCheck.stdout);
    if (pkg.scripts?.start) startCmd = pkg.scripts.start;
    else if (pkg.main) startCmd = `node ${pkg.main}`;
    else if (pkg.bin) startCmd = `node ${Object.values(pkg.bin)[0]}`;
  } catch {}

  // Generate ecosystem.config.cjs
  const eco = `module.exports = {
  apps: [{
    name: '${name}',
    script: '${startCmd}',
    cwd: '${targetDir}',
    env: { NODE_ENV: 'production', PORT: ${port} },
    instances: 1,
    exec_mode: 'fork',
    max_memory_restart: '500M',
    restart_delay: 3000,
    min_uptime: '10s',
    autorestart: true,
    watch: false,
    error_file: '/var/log/pm2/${name}-err.log',
    out_file: '/var/log/pm2/${name}-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
  }]
};`;

  const ecoPath = `${targetDir}/ecosystem.config.cjs`;
  const r1 = await ssh.execCommand(`cat > ${ecoPath} << 'EOF'\n${eco}\nEOF`);
  if (r1.code !== 0) return { ok: false, error: r1.stderr?.slice(0, 200) };

  // Ensure log dir
  await ssh.execCommand('mkdir -p /var/log/pm2');

  // Clean restart: delete old then start fresh
  await ssh.execCommand(`pm2 delete ${name} 2>&1 || true`);
  const r2 = await ssh.execCommand(`cd ${targetDir} && pm2 start ecosystem.config.cjs`);
  if (r2.code !== 0) {
    return { ok: false, error: r2.stderr?.slice(0, 200), output: r2.stdout?.slice(0, 200) };
  }

  // Save PM2 config for auto-restart on boot
  const r3 = await ssh.execCommand('pm2 save && pm2 startup systemd --user $(whoami) 2>&1 || true');

  return { ok: true, name, startCmd, ecoPath, output: r2.stdout?.slice(0, 200) };
}

// ── Domain + SSL ───────────────────────────────────────────────────────────

async function configureDomainOnServer(ssh, server, domain, appPort, ssl) {
  const confPath = `/etc/nginx/sites-available/${domain}`;
  const enabledPath = `/etc/nginx/sites-enabled/${domain}`;
  const defaultPath = '/etc/nginx/sites-enabled/default';

  // ALWAYS write non-SSL config first — certbot will add SSL block later
  const httpConf = buildNginxConfig({ domain, app_port: appPort, ssl: false });
  const r1 = await ssh.execCommand(`sudo tee ${confPath} > /dev/null << 'EOF'\n${httpConf}\nEOF`);
  if (r1.code !== 0) return { ok: false, error: `nginx write failed: ${r1.stderr?.slice(0, 200)}` };

  // Enable site
  const r2 = await ssh.execCommand(`sudo ln -sf ${confPath} ${enabledPath} && sudo rm -f ${defaultPath} && sudo nginx -t && sudo systemctl reload nginx`);
  if (r2.code !== 0) return { ok: false, error: `nginx enable failed: ${r2.stderr?.slice(0, 200)}` };

  // SSL via certbot (modifies the existing config)
  if (ssl) {
    const dnsCheck = await ssh.execCommand(`curl -s -o /dev/null -w "%{http_code}" http://${domain} || echo "DNS"`);
    const dnsCode = dnsCheck.stdout.trim();
    if (dnsCode !== 'DNS' && !dnsCode.startsWith('2') && !dnsCode.startsWith('3')) {
      return { ok: true, ssl: false, warning: `DNS not yet resolving to this server (got ${dnsCode}). Point A record to ${server.host} and re-run auto_connect_domain.` };
    }
    const r3 = await ssh.execCommand(`sudo certbot --nginx -d ${domain} --non-interactive --agree-tos --email admin@${domain} --redirect 2>&1 || echo "CERTBOT_FAILED"`);
    const sslOk = !r3.stdout?.includes('CERTBOT_FAILED') && !r3.stdout?.includes('error');
    return { ok: true, ssl: sslOk, output: r3.stdout?.slice(0, 200), warning: sslOk ? null : 'SSL certbot failed. Domain works on HTTP; SSL may need manual setup.' };
  }

  return { ok: true, ssl: false };
}

// ── Health Check ───────────────────────────────────────────────────────────

async function waitForAppReady(ssh, port, pm2Name, maxAttempts = 5, delayMs = 4000) {
  let pm2Status = 'unknown';
  let httpStatus = '000';
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (pm2Name) {
      const r = await ssh.execCommand(`pm2 describe ${pm2Name} | grep -E "status|pid|memory|restarts" | head -6`);
      pm2Status = r.stdout?.slice(0, 200) || 'no output';
      const isOnline = r.stdout.includes('online');
      if (!isOnline) {
        await ssh.execCommand(`pm2 restart ${pm2Name}`);
      }
    }
    const r2 = await ssh.execCommand(`curl -s -o /dev/null -w "%{http_code}" http://localhost:${port} || echo "000"`);
    httpStatus = r2.stdout.trim();
    if (httpStatus.startsWith('2') || httpStatus.startsWith('3')) {
      return { ok: true, pm2Status, httpStatus, attempts: attempt };
    }
    if (attempt < maxAttempts) {
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
  return { ok: false, pm2Status, httpStatus, attempts: maxAttempts };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function generatePassword(len = 16) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  let pw = '';
  for (let i = 0; i < len; i++) pw += chars[Math.floor(Math.random() * chars.length)];
  return pw;
}

// ── Auto-Add API Keys to VPS ───────────────────────────────────────────────

export { configureDomainOnServer };

/**
 * Safely add multiple API keys to a VPS .env file.
 */
export async function addApiKeysToVps(server, keys, envFile = '.env') {
  const ssh = new NodeSSH();
  try {
    await ssh.connect({ host: server.host, port: server.port || 22, username: server.username, privateKey: server.private_key, readyTimeout: 10000 });
    const absPath = envFile.startsWith('/') ? envFile : `${server.deploy_dir || '/var/www/app'}/${envFile}`;
    const lines = Object.entries(keys).map(([k, v]) => `${k}=${String(v).replace(/'/g, "'\\''")}`).join('\n');
    const r = await ssh.execCommand(`cat >> ${absPath} << 'EOF'\n${lines}\nEOF`);
    ssh.dispose();
    return { ok: r.code === 0, keys: Object.keys(keys), path: absPath, error: r.stderr?.slice(0, 200) };
  } catch (err) {
    if (ssh.isConnected()) ssh.dispose();
    return { error: err.message };
  }
}

// ── Self-Debug: Run diagnostic on VPS ──────────────────────────────────────

/**
 * Run a diagnostic suite on a VPS and return actionable results.
 */
export async function runDiagnostics(server, targetDir) {
  const ssh = new NodeSSH();
  const results = [];
  try {
    await ssh.connect({ host: server.host, port: server.port || 22, username: server.username, privateKey: server.private_key, readyTimeout: 10000 });

    const checks = [
      { name: 'disk', cmd: "df -h / | tail -1 | awk '{print $5}'" },
      { name: 'memory', cmd: "free -h | grep Mem" },
      { name: 'pm2', cmd: 'pm2 list' },
      { name: 'nginx', cmd: 'nginx -t 2>&1' },
      { name: 'app_logs', cmd: targetDir ? `cd ${targetDir} && pm2 logs --lines 20` : 'echo "no targetDir"' },
      { name: 'env', cmd: targetDir ? `cd ${targetDir} && cat .env | head -10` : 'echo "no targetDir"' },
      { name: 'ports', cmd: `netstat -tlnp 2>/dev/null || ss -tlnp` },
      { name: 'services', cmd: 'systemctl --failed' },
    ];

    for (const c of checks) {
      const r = await ssh.execCommand(c.cmd);
      results.push({
        name: c.name,
        ok: r.code === 0,
        output: (r.stdout || r.stderr).trim().slice(0, 300)
      });
    }

    ssh.dispose();
    return { ok: true, results };
  } catch (err) {
    if (ssh.isConnected()) ssh.dispose();
    return { error: err.message, results };
  }
}
