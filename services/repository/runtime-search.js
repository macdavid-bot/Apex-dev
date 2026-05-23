import { executeCommand } from '../shell/runtime.js';

export async function searchRepository(query, cwd) {
  return executeCommand('rg', [query, cwd], cwd);
}
