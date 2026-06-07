import { readFile, writeFile, readdir, stat } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

export async function readLocalFile(filePath) {
  const abs = path.resolve(filePath);
  try {
    const content = await readFile(abs, 'utf-8');
    return { path: filePath, content, lines: content.split('\n').length };
  } catch (err) {
    if (err.code === 'ENOENT') return { path: filePath, error: `File not found: ${filePath}` };
    return { path: filePath, error: err.message };
  }
}

export async function writeLocalFile(filePath, content) {
  const abs = path.resolve(filePath);
  await writeFile(abs, content, 'utf-8');
  return { success: true, path: filePath };
}

// Targeted str_replace edit — finds old_str and replaces with new_str.
// Throws a descriptive error if old_str is not found, so the AI can correct itself.
export async function patchLocalFile(filePath, oldStr, newStr) {
  const abs = path.resolve(filePath);
  const content = await readFile(abs, 'utf-8');

  if (!content.includes(oldStr)) {
    // Give context: show the first 40 chars of old_str for debugging
    const preview = oldStr.slice(0, 60).replace(/\n/g, '↵');
    throw new Error(
      `old_str not found in ${filePath}. ` +
      `Searched for: "${preview}". ` +
      `Read the file first to get the exact text.`
    );
  }

  // Only replace the first occurrence to keep edits surgical
  const updated = content.replace(oldStr, newStr);
  await writeFile(abs, updated, 'utf-8');
  return { success: true, path: filePath, replacements: 1 };
}

export async function listLocalDir(dirPath) {
  const abs = path.resolve(dirPath);
  try {
    const entries = await readdir(abs, { withFileTypes: true });
    const result = await Promise.all(
      entries.map(async e => {
        const info = { name: e.name, type: e.isDirectory() ? 'dir' : 'file' };
        if (e.isFile()) {
          try {
            const s = await stat(path.join(abs, e.name));
            info.size = s.size;
          } catch { /* ignore */ }
        }
        return info;
      })
    );
    return { path: dirPath, entries: result };
  } catch (err) {
    if (err.code === 'ENOENT') {
      return { path: dirPath, entries: [], error: `Directory not found: ${dirPath}` };
    }
    return { path: dirPath, entries: [], error: err.message };
  }
}
