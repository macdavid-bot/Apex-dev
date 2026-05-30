// WebSocket real-time terminal — streams shell output live, accepts stdin.
// Uses child_process.spawn (works everywhere without native modules).
import { spawn } from 'child_process';
import os from 'os';
import path from 'path';
import { existsSync, statSync } from 'fs';
import { verifyToken } from '../../../../services/auth/jwt.js';

// sessionId → { proc, cwd, alive }
const ptySessions = new Map();

export function attachTerminalWS(wss) {
  wss.on('connection', (ws, req) => {
    // Auth: token in ?token= query param
    let user = null;
    try {
      const url = new URL(req.url, 'http://localhost');
      const token = url.searchParams.get('token');
      if (!token) { ws.close(4001, 'Unauthorized'); return; }
      user = verifyToken(token);
    } catch {
      ws.close(4001, 'Unauthorized');
      return;
    }

    const url = new URL(req.url, 'http://localhost');
    const sessionId = url.searchParams.get('sessionId') || 'default';

    let cwd = process.cwd();
    let proc = null;
    let alive = true;

    function send(type, data) {
      if (ws.readyState === 1) { // OPEN
        ws.send(JSON.stringify({ type, data }));
      }
    }

    function spawnShell() {
      const shell = process.env.SHELL || '/bin/bash';
      proc = spawn(shell, [], {
        cwd,
        env: {
          ...process.env,
          TERM: 'xterm-256color',
          COLORTERM: 'truecolor',
          HOME: os.homedir(),
          SHELL: shell
        },
        stdio: ['pipe', 'pipe', 'pipe']
      });

      proc.stdout.on('data', d => send('output', d.toString()));
      proc.stderr.on('data', d => send('output', d.toString()));
      proc.on('close', code => {
        if (alive) send('exit', { code });
      });
      proc.on('error', err => {
        send('error', err.message);
      });

      send('ready', { sessionId, cwd });
    }

    spawnShell();

    ws.on('message', raw => {
      let msg;
      try { msg = JSON.parse(raw); } catch { return; }

      switch (msg.type) {
        case 'input':
          if (proc && !proc.killed) {
            proc.stdin.write(msg.data);
          }
          break;

        case 'resize':
          // node-pty would use proc.resize() here — spawn doesn't support this
          break;

        case 'ping':
          send('pong', {});
          break;
      }
    });

    ws.on('close', () => {
      alive = false;
      if (proc && !proc.killed) {
        proc.kill('SIGTERM');
        setTimeout(() => { try { proc.kill('SIGKILL'); } catch {} }, 2000);
      }
      ptySessions.delete(sessionId);
    });

    ptySessions.set(sessionId, { proc, cwd, alive: true });
  });
}
