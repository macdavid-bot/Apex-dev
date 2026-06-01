import { useEffect, useRef, useState, useId, useCallback } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import 'xterm/css/xterm.css';
import './Panel.css';
import './TerminalPanel.css';
import { getToken, authHeaders } from '../hooks/useAuth';

// Build a WebSocket URL that works in any environment
// (proxied dev server or VPS behind nginx — same host, ws(s):// based on https)
function buildWsUrl(path) {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}${path}`;
}

export default function TerminalPanel() {
  const rawId    = useId();
  const sessionId = useRef('ws-term-' + rawId.replace(/:/g, ''));
  const containerRef = useRef(null);
  const termRef      = useRef(null);
  const wsRef        = useRef(null);
  const fitRef       = useRef(null);
  const modeRef      = useRef('local');

  const [connected,   setConnected]   = useState(false);
  const [mode,        setMode]        = useState('local');
  const [vpsServers,  setVpsServers]  = useState([]);
  const [activeVps,   setActiveVps]   = useState('');
  const [status,      setStatus]      = useState('Connecting…');

  // ── Init xterm.js ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || termRef.current) return;

    const term = new Terminal({
      theme: {
        background:    '#0d1117',
        foreground:    '#e6edf3',
        cursor:        '#58a6ff',
        selectionBackground: 'rgba(88,166,255,0.25)',
        black:         '#484f58',
        red:           '#ff7b72',
        green:         '#3fb950',
        yellow:        '#d29922',
        blue:          '#58a6ff',
        magenta:       '#bc8cff',
        cyan:          '#39c5cf',
        white:         '#b1bac4',
        brightBlack:   '#6e7681',
        brightRed:     '#ffa198',
        brightGreen:   '#56d364',
        brightYellow:  '#e3b341',
        brightBlue:    '#79c0ff',
        brightMagenta: '#d2a8ff',
        brightCyan:    '#56d364',
        brightWhite:   '#f0f6fc'
      },
      fontFamily:  '"JetBrains Mono", "Fira Code", "Cascadia Code", Menlo, monospace',
      fontSize:    13,
      lineHeight:  1.4,
      cursorBlink: true,
      scrollback:  5000,
      allowProposedApi: true
    });

    const fitAddon   = new FitAddon();
    const linksAddon = new WebLinksAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(linksAddon);
    term.open(containerRef.current);
    fitAddon.fit();

    termRef.current = term;
    fitRef.current  = fitAddon;

    const ro = new ResizeObserver(() => { try { fitAddon.fit(); } catch {} });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      term.dispose();
      termRef.current = null;
    };
  }, []);

  // ── Local shell WebSocket ──────────────────────────────────────────────────
  const connectLocalWS = useCallback(() => {
    const token = getToken();
    if (!token) { setStatus('Not authenticated'); return; }

    wsRef.current?.close();

    // Use relative host — works in dev (via Vite proxy) and production (via nginx)
    const wsUrl = buildWsUrl(`/ws/terminal?token=${encodeURIComponent(token)}&sessionId=${sessionId.current}`);
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    setStatus('Connecting…');

    ws.onopen = () => { setConnected(true); setStatus('Connected'); };

    ws.onclose = () => {
      setConnected(false);
      if (modeRef.current !== 'local') return;
      setStatus('Disconnected — reconnecting in 3s…');
      termRef.current?.writeln('\r\n\x1b[33m[Terminal disconnected — reconnecting…]\x1b[0m');
      setTimeout(() => { if (modeRef.current === 'local') connectLocalWS(); }, 3000);
    };

    ws.onerror = () => setStatus('Connection error');

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if      (msg.type === 'output') termRef.current?.write(msg.data);
        else if (msg.type === 'exit')   termRef.current?.writeln(`\r\n\x1b[33m[Process exited: ${msg.data?.code}]\x1b[0m`);
        else if (msg.type === 'error')  termRef.current?.writeln(`\r\n\x1b[31m[Error: ${msg.data}]\x1b[0m`);
        else if (msg.type === 'ready')  termRef.current?.writeln(`\x1b[32m[Shell ready — ${msg.data?.cwd}]\x1b[0m\r\n`);
      } catch {}
    };

    if (termRef.current) {
      termRef.current.onData(data => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'input', data }));
        }
      });
    }
  }, []);

  // ── VPS SSH WebSocket ──────────────────────────────────────────────────────
  const connectVpsWS = useCallback((serverId) => {
    if (!serverId) return;
    const token = getToken();
    if (!token) { setStatus('Not authenticated'); return; }

    wsRef.current?.close();
    setConnected(false);
    setStatus('Connecting to VPS…');

    const wsUrl = buildWsUrl(`/ws/vps/${serverId}?token=${encodeURIComponent(token)}`);
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => { setConnected(true); setStatus('VPS Connected'); };

    ws.onclose = () => {
      setConnected(false);
      setStatus('VPS Disconnected');
      termRef.current?.writeln('\r\n\x1b[33m[VPS session closed]\x1b[0m');
    };

    ws.onerror = () => setStatus('VPS connection error');

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if      (msg.type === 'output') termRef.current?.write(msg.data);
        else if (msg.type === 'error')  termRef.current?.writeln(`\r\n\x1b[31m[VPS Error: ${msg.data}]\x1b[0m`);
        else if (msg.type === 'ready')  termRef.current?.writeln(`\x1b[32m[VPS shell ready]\x1b[0m\r\n`);
        else if (msg.type === 'closed') termRef.current?.writeln(`\r\n\x1b[33m[VPS connection closed]\x1b[0m`);
      } catch {}
    };

    if (termRef.current) {
      termRef.current.onData(data => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'input', data }));
        }
      });
    }
  }, []);

  // ── Mode: local ────────────────────────────────────────────────────────────
  useEffect(() => {
    modeRef.current = mode;
    if (mode !== 'local') return;
    connectLocalWS();
    return () => wsRef.current?.close();
  }, [mode, connectLocalWS]);

  // ── Mode: vps — load server list ───────────────────────────────────────────
  useEffect(() => {
    if (mode !== 'vps') return;
    wsRef.current?.close();
    setConnected(false);
    setStatus('Select a VPS server');
    fetch('/vps/servers', { headers: authHeaders() })
      .then(r => r.ok ? r.json() : [])
      .then(data => {
        const list = Array.isArray(data) ? data : [];
        setVpsServers(list);
        if (list.length) {
          setActiveVps(list[0].id);
          connectVpsWS(list[0].id);
        }
      })
      .catch(() => {});
  }, [mode, connectVpsWS]);

  function handleModeSwitch(newMode) {
    setMode(newMode);
    wsRef.current?.close();
    termRef.current?.clear();
    termRef.current?.writeln(`\x1b[34m[Switched to ${newMode} mode]\x1b[0m\r\n`);
  }

  function handleVpsChange(serverId) {
    setActiveVps(serverId);
    termRef.current?.clear();
    connectVpsWS(serverId);
  }

  const activeVpsInfo = vpsServers.find(s => s.id === activeVps);

  return (
    <div className="panel terminal-panel" style={{ display: 'flex', flexDirection: 'column' }}>
      <div className="panel-title" style={{ paddingBottom: 8, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h2>Terminal</h2>
            <span style={{ fontSize: 11, color: connected ? '#3fb950' : '#f85149', fontWeight: 600 }}>
              ● {status}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button className="ghost-btn" onClick={() => termRef.current?.clear()} title="Clear">Clear</button>
            <div className="mode-tabs">
              <button
                className={`mode-tab ${mode === 'local' ? 'active' : ''}`}
                onClick={() => handleModeSwitch('local')}
              >Local</button>
              <button
                className={`mode-tab ${mode === 'vps' ? 'active' : ''}`}
                onClick={() => handleModeSwitch('vps')}
              >VPS / SSH</button>
            </div>
          </div>
        </div>

        {mode === 'vps' && vpsServers.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
            <select
              className="field-input"
              style={{ fontSize: 13, padding: '5px 10px', flex: 1 }}
              value={activeVps}
              onChange={e => handleVpsChange(e.target.value)}
            >
              {vpsServers.map(s => (
                <option key={s.id} value={s.id}>{s.label} — {s.username}@{s.host}</option>
              ))}
            </select>
            {activeVpsInfo && (
              <span style={{ fontSize: 12, color: connected ? '#3fb950' : '#8b949e', whiteSpace: 'nowrap' }}>
                ● {connected ? 'Connected' : 'Disconnected'}
              </span>
            )}
            {connected && (
              <button
                className="ghost-btn"
                style={{ fontSize: 11 }}
                onClick={() => connectVpsWS(activeVps)}
              >Reconnect</button>
            )}
          </div>
        )}
        {mode === 'vps' && vpsServers.length === 0 && (
          <p className="muted" style={{ marginTop: 8 }}>
            No VPS servers saved. Add one in the VPS Servers tab first.
          </p>
        )}
      </div>

      <div
        ref={containerRef}
        style={{ flex: 1, minHeight: 0, background: '#0d1117', borderRadius: 6, overflow: 'hidden' }}
      />
    </div>
  );
}
