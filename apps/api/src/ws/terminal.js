// WebSocket real-time terminal — streams shell output live, accepts stdin.
// Uses child_process.spawn with -i flag to ensure an interactive shell.
import { spawn } from 'child_process';
import os from 'os';
import { verifyToken } from '../../../../services/auth/jwt.js';

const PING_INTERVAL_MS = 20_000;

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

    let proc = null;
    let alive = true;

    function send(type, data) {
      if (ws.readyState === 1 /* OPEN */) {
        try { ws.send(JSON.stringify({ type, data })); } catch {}
      }
    }

    // Keepalive: send a ping so idle connections don't drop
    const pingTimer = setInterval(() => {
      if (ws.readyState === 1) send('ping', {});
      else clearInterval(pingTimer);
    }, PING_INTERVAL_MS);

    function spawnShell() {
      const shell = process.env.SHELL || '/bin/bash';
      proc = spawn(shell, ['-i'], {          // -i = interactive: enables job control, PS1, etc.
        cwd: process.cwd(),
        env: {
          ...process.env,
          TERM: 'xterm-256color',
          COLORTERM: 'truecolor',
          HOME: os.homedir(),
          SHELL: shell,
          FORCE_COLOR: '1'
        },
        stdio: ['pipe', 'pipe', 'pipe'],
        detached: false
      });

      proc.stdout.on('data', d => send('output', d.toString()));
      proc.stderr.on('data', d => send('output', d.toString()));

      proc.on('close', code => {
        if (alive) {
          send('exit', { code });
          // Don't auto-restart on server side — let the client decide
        }
      });

      proc.on('error', err => {
        send('error', err.message);
      });

      send('ready', { sessionId, cwd: process.cwd() });
    }

    spawnShell();

    ws.on('message', raw => {
      let msg;
      try { msg = JSON.parse(raw); } catch { return; }

      switch (msg.type) {
        case 'input':
          if (proc && !proc.killed && proc.stdin.writable) {
            try { proc.stdin.write(msg.data); } catch {}
          }
          break;

        case 'resize':
          // child_process.spawn doesn't support PTY resize natively;
          // node-pty would use proc.resize(cols, rows) here.
          break;

        case 'ping':
          send('pong', {});
          break;

        case 'restart':
          // Client explicitly requests a new shell (e.g. after process exit)
          if (proc && !proc.killed) {
            try { proc.kill('SIGTERM'); } catch {}
          }
          setTimeout(() => { if (alive) spawnShell(); }, 300);
          break;
      }
    });

    ws.on('close', () => {
      alive = false;
      clearInterval(pingTimer);
      if (proc && !proc.killed) {
        try { proc.kill('SIGTERM'); } catch {}
        setTimeout(() => { try { proc.kill('SIGKILL'); } catch {} }, 2000);
      }
    });

    ws.on('error', () => {
      alive = false;
      clearInterval(pingTimer);
    });
  });
}
