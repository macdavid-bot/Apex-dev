import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function managePM2Process(name, action = 'restart') {
  try {
    const { stdout, stderr } = await execAsync(`pm2 ${action} "${name}"`, { timeout: 20000 });
    return {
      success: true,
      process: name,
      action,
      output: (stdout || stderr).trim(),
      managedAt: new Date().toISOString()
    };
  } catch (err) {
    return {
      success: false,
      process: name,
      action,
      error: err.message,
      managedAt: new Date().toISOString()
    };
  }
}

export async function startPM2App(script, name, cwd) {
  const cwdFlag = cwd ? `--cwd "${cwd}"` : '';
  try {
    const { stdout } = await execAsync(
      `pm2 start "${script}" --name "${name}" ${cwdFlag} --update-env`.trim(),
      { timeout: 30000 }
    );
    return { success: true, name, output: stdout.trim(), startedAt: new Date().toISOString() };
  } catch (err) {
    return { success: false, name, error: err.message };
  }
}

export async function savePM2Config() {
  try {
    const { stdout } = await execAsync('pm2 save', { timeout: 10000 });
    return { success: true, output: stdout.trim() };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
