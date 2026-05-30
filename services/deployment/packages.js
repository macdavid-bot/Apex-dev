import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function installPackage(name, cwd = process.cwd()) {
  if (!name) return { success: false, error: 'package name is required' };
  try {
    const { stdout, stderr } = await execAsync(`pnpm add ${name}`, { cwd, timeout: 60000 });
    return {
      success: true,
      package: name,
      output: (stdout || stderr).trim(),
      installedAt: new Date().toISOString()
    };
  } catch (err) {
    return { success: false, package: name, error: err.message, installedAt: new Date().toISOString() };
  }
}

export async function installDependencies(cwd = process.cwd()) {
  try {
    const { stdout, stderr } = await execAsync('pnpm install', { cwd, timeout: 120000 });
    return { success: true, output: (stdout || stderr).trim(), installedAt: new Date().toISOString() };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
