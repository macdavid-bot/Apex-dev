import { executeCommand } from '../shell/runtime.js';

export async function runBuild(cwd) {
  return executeCommand('pnpm', ['build'], cwd);
}

export async function runLint(cwd) {
  return executeCommand('pnpm', ['lint'], cwd);
}

export async function installDependencies(cwd) {
  return executeCommand('pnpm', ['install'], cwd);
}
