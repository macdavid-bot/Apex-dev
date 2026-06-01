// Pre-deployment validation — checks env vars, services, dependencies, build.
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function run(cmd, opts = {}) {
  try {
    const { stdout, stderr } = await execAsync(cmd, { timeout: 30000, ...opts });
    return { ok: true, stdout: stdout.trim(), stderr: stderr.trim() };
  } catch (e) {
    return { ok: false, stdout: e.stdout?.trim() || '', stderr: (e.stderr || e.message).trim() };
  }
}

// Validate environment variables on a VPS server via SSH
export async function validateVpsDeployment(server, requiredEnvVars = []) {
  const { NodeSSH } = await import('node-ssh');
  const ssh = new NodeSSH();
  const checks = [];

  try {
    await ssh.connect({
      host: server.host, port: server.port || 22,
      username: server.username, privateKey: server.private_key,
      readyTimeout: 10000
    });

    // 1. Check deploy directory exists
    const deployDir = server.deploy_dir || server.deployDir || '';
    if (deployDir) {
      const r = await ssh.execCommand(`test -d "${deployDir}" && echo exists || echo missing`);
      checks.push({
        label: `Deploy directory: ${deployDir}`,
        success: r.stdout.trim() === 'exists',
        output: r.stdout.trim()
      });
    }

    // 2. Check required env vars in .env file
    const envFile = server.env_file || server.envFile || '.env';
    for (const key of requiredEnvVars) {
      const r = await ssh.execCommand(`grep -q "^${key}=" ~/${envFile} 2>/dev/null && echo found || echo missing`);
      checks.push({
        label: `Env var: ${key}`,
        success: r.stdout.trim() === 'found',
        output: r.stdout.trim()
      });
    }

    // 3. Check node/npm/pnpm available
    for (const cmd of ['node --version', 'npm --version']) {
      const r = await ssh.execCommand(cmd);
      checks.push({
        label: `Runtime: ${cmd}`,
        success: r.code === 0,
        output: (r.stdout || r.stderr).trim().slice(0, 40)
      });
    }

    // 4. Check PM2 available
    const pm2r = await ssh.execCommand('pm2 --version 2>/dev/null || echo "not found"');
    checks.push({
      label: 'PM2 available',
      success: !pm2r.stdout.includes('not found'),
      output: pm2r.stdout.trim().slice(0, 30)
    });

    // 5. Check disk space (>500MB free)
    const diskr = await ssh.execCommand("df -BM / | tail -1 | awk '{print $4}' | tr -d 'M'");
    const freeMB = parseInt(diskr.stdout.trim()) || 0;
    checks.push({
      label: `Disk space: ${freeMB}MB free`,
      success: freeMB > 500,
      output: freeMB > 500 ? 'OK' : 'Low disk space'
    });

    // 6. If package.json exists in deploy_dir, check npm install completed
    if (deployDir) {
      const pkgr = await ssh.execCommand(`test -d "${deployDir}/node_modules" && echo ok || echo missing`);
      checks.push({
        label: 'Dependencies installed',
        success: pkgr.stdout.trim() === 'ok',
        output: pkgr.stdout.trim() === 'ok' ? 'node_modules found' : 'node_modules missing — run install'
      });
    }

    ssh.dispose();
  } catch (err) {
    ssh.isConnected?.() && ssh.dispose();
    checks.push({ label: 'SSH connection', success: false, output: err.message });
  }

  const success = checks.every(c => c.success);
  return {
    success,
    server: server.label || server.host,
    checks,
    completedAt: new Date().toISOString()
  };
}

// Validate local project directory
export async function validateLocalDeployment(dir = '.', requiredEnvVars = []) {
  const checks = [];

  // 1. Directory exists
  const existsR = await run(`test -d "${dir}" && echo ok || echo missing`);
  checks.push({ label: `Directory: ${dir}`, success: existsR.stdout === 'ok', output: existsR.stdout });
  if (existsR.stdout !== 'ok') return { success: false, checks };

  // 2. package.json exists
  const pkgR = await run(`test -f "${dir}/package.json" && echo ok || echo missing`);
  checks.push({ label: 'package.json', success: pkgR.stdout === 'ok', output: pkgR.stdout });

  // 3. node_modules exists
  const nmR = await run(`test -d "${dir}/node_modules" && echo ok || echo missing`);
  checks.push({ label: 'Dependencies', success: nmR.stdout === 'ok', output: nmR.stdout === 'ok' ? 'installed' : 'run install first' });

  // 4. .env file
  const envR = await run(`test -f "${dir}/.env" && echo ok || echo missing`);
  checks.push({ label: '.env file', success: envR.stdout === 'ok', output: envR.stdout });

  // 5. Required env vars
  for (const key of requiredEnvVars) {
    const grepR = await run(`grep -q "^${key}=" "${dir}/.env" 2>/dev/null && echo found || echo missing`);
    checks.push({ label: `Env: ${key}`, success: grepR.stdout === 'found', output: grepR.stdout });
  }

  // 6. Try a lint/build check if scripts exist
  const scriptR = await run(`node -e "const p=require('${dir}/package.json'); console.log(Object.keys(p.scripts||{}).join(','))" 2>/dev/null || echo ""`);
  const scripts = scriptR.stdout.split(',').filter(Boolean);
  checks.push({ label: 'Scripts available', success: scripts.length > 0, output: scripts.join(', ') || 'none' });

  const success = checks.filter(c => c.label !== '.env file').every(c => c.success);
  return { success, dir, checks, completedAt: new Date().toISOString() };
}
