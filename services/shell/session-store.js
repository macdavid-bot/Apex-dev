// Persistent shell sessions — tracks cwd and history per browser/terminal session.
// cd commands are handled specially so the working directory persists between exec calls.

import { exec } from 'child_process';
import { promisify } from 'util';
import os from 'os';
import path from 'path';
import { statSync } from 'fs';

const execAsync = promisify(exec);
const sessions = new Map();
const MAX_HISTORY = 200;

export function createSession(id) {
  const session = {
    id,
    cwd: process.cwd(),
    history: [],
    createdAt: new Date().toISOString()
  };
  sessions.set(id, session);
  return { id, cwd: session.cwd, history: [] };
}

export function deleteSession(id) {
  sessions.delete(id);
}

export function getSession(id) {
  const s = sessions.get(id);
  if (!s) return null;
  return { id: s.id, cwd: s.cwd, history: [...s.history] };
}

export function getOrCreate(id) {
  if (!sessions.has(id)) createSession(id);
  return sessions.get(id);
}

export async function execInSession(sessionId, command) {
  const session = getOrCreate(sessionId);
  const trimmed = command.trim();

  // Track history (skip duplicates of last entry)
  if (trimmed && session.history.at(-1) !== trimmed) {
    session.history.push(trimmed);
    if (session.history.length > MAX_HISTORY) session.history.shift();
  }

  // Handle `cd` specially — plain exec() can't persist cwd changes
  const cdMatch = trimmed.match(/^cd(?:\s+(.+))?$/);
  if (cdMatch) {
    const target = cdMatch[1]?.trim() || os.homedir();
    const expanded = target.startsWith('~')
      ? target.replace('~', os.homedir())
      : target;
    const resolved = path.resolve(session.cwd, expanded);

    try {
      const stat = statSync(resolved);
      if (!stat.isDirectory()) {
        return { success: false, stdout: '', stderr: `cd: not a directory: ${target}`, cwd: session.cwd };
      }
      session.cwd = resolved;
      return { success: true, stdout: '', stderr: '', cwd: session.cwd };
    } catch {
      return { success: false, stdout: '', stderr: `cd: no such file or directory: ${target}`, cwd: session.cwd };
    }
  }

  // Handle `clear` / `cls`
  if (trimmed === 'clear' || trimmed === 'cls') {
    return { success: true, stdout: '\x1b[2J\x1b[H', stderr: '', cwd: session.cwd, clearScreen: true };
  }

  try {
    const { stdout, stderr } = await execAsync(trimmed, {
      cwd: session.cwd,
      timeout: 30000,
      env: { ...process.env, TERM: 'xterm-256color', FORCE_COLOR: '1' }
    });
    return { success: true, stdout, stderr, cwd: session.cwd };
  } catch (err) {
    return {
      success: false,
      stdout: err.stdout || '',
      stderr: err.stderr || err.message,
      cwd: session.cwd,
      exitCode: err.code ?? 1
    };
  }
}
