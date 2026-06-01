// VPS SSH interactive WebSocket — streams a real SSH shell via node-ssh / ssh2.
// Each WS connection opens an SSH session, proxies stdin/stdout bidirectionally.
import { verifyToken } from '../../../../services/auth/jwt.js';
import { query, queryOne, dbAvailable } from '../../../../services/db/client.js';
import { sessions as memSessions } from '../../../../services/vps/sessions.js';

async function getServer(id) {
  try {
    if (await dbAvailable()) {
      return await queryOne('SELECT * FROM ssh_sessions WHERE id=$1', [id]);
    }
  } catch {}
  return memSessions.get(id) || null;
}

export function attachVpsWS(wss) {
  wss.on('connection', async (ws, req) => {
    // Auth: ?token= query param
    let user = null;
    let serverId = null;
    try {
      const url     = new URL(req.url, 'http://localhost');
      const token   = url.searchParams.get('token');
      serverId      = url.pathname.split('/').pop(); // /ws/vps/:id
      if (!token)  { ws.close(4001, 'Unauthorized'); return; }
      user = verifyToken(token);
    } catch {
      ws.close(4001, 'Unauthorized');
      return;
    }

    function send(type, data) {
      if (ws.readyState === 1) ws.send(JSON.stringify({ type, data }));
    }

    // Load server config
    const server = await getServer(serverId);
    if (!server) {
      send('error', `Server ${serverId} not found`);
      ws.close(4004, 'Server not found');
      return;
    }

    send('output', `\x1b[36mConnecting to ${server.username}@${server.host}:${server.port || 22}…\x1b[0m\r\n`);

    let sshStream = null;
    let sshConn   = null;

    // Lazy-import ssh2 (native module — might need build approval)
    let Client;
    try {
      const ssh2 = await import('ssh2');
      Client = ssh2.Client;
    } catch (e) {
      send('error', 'ssh2 module unavailable: ' + e.message);
      ws.close(1011, 'ssh2 unavailable');
      return;
    }

    const conn = new Client();
    sshConn = conn;

    conn.on('ready', () => {
      conn.shell({ term: 'xterm-256color', cols: 200, rows: 50 }, (err, stream) => {
        if (err) {
          send('error', err.message);
          ws.close(1011, 'Shell error');
          return;
        }
        sshStream = stream;
        send('ready', { host: server.host, username: server.username });

        stream.on('data', d => send('output', d.toString('utf8')));
        stream.stderr.on('data', d => send('output', d.toString('utf8')));

        stream.on('close', () => {
          send('closed', null);
          ws.close(1000, 'SSH session ended');
        });
      });
    });

    conn.on('error', err => {
      send('error', `SSH error: ${err.message}`);
      ws.close(1011, err.message);
    });

    // Connect
    const connectConfig = {
      host:        server.host,
      port:        server.port || 22,
      username:    server.username,
      readyTimeout: 10000,
      keepaliveInterval: 10000,
    };

    // Private key or password
    const pk = server.private_key || server.privateKey;
    if (pk && pk.includes('BEGIN')) {
      connectConfig.privateKey = pk;
    } else if (pk) {
      connectConfig.password = pk;
    }

    try {
      conn.connect(connectConfig);
    } catch (e) {
      send('error', `Connect failed: ${e.message}`);
      ws.close(1011, e.message);
      return;
    }

    // Handle messages from browser terminal
    ws.on('message', raw => {
      let msg;
      try { msg = JSON.parse(raw); } catch { return; }

      switch (msg.type) {
        case 'input':
          if (sshStream) sshStream.write(msg.data);
          break;
        case 'resize':
          if (sshStream && msg.cols && msg.rows) {
            try { sshStream.setWindow(msg.rows, msg.cols, 0, 0); } catch {}
          }
          break;
        case 'ping':
          send('pong', {});
          break;
      }
    });

    ws.on('close', () => {
      try { sshStream?.close(); } catch {}
      try { sshConn?.end();    } catch {}
    });

    ws.on('error', () => {
      try { sshConn?.end(); } catch {}
    });
  });
}
