import { useEffect, useRef, useState, useId, useCallback } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import 'xterm/css/xterm.css';
import './Panel.css';
import './TerminalPanel.css';
import { getToken, authHeaders } from '../hooks/useAuth';

function buildWsUrl(path) {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}${path}`;
}

const MAX_RECONNECT_ATTEMPTS = 8;
const RECONNECT_BASE_MS = 2000;
const RECONNECT_MAX_MS  = 20000;

export default function TerminalPanel() {
  const rawId     = useId();
  const sessionId = useRef('ws-term-' + rawId.replace(/:/g, ''));

  const containerRef = useRef(null);
  const termRef      = useRef(null);
  const wsRef        = useRef(null);
  const fitRef       = useRef(null);
  const modeRef      = useRef('local');

  // Reconnection state
  const reconnectCount  = useRef(0);
  const reconnectTimer  = useRef(null);
  const manualClose     = useRef(false);
  const dataDisposable  = useRef(null);   // xterm onData disposable — prevents stacking

  const [connected,  setConnected]  = useState(false);
  const [mode,       setMode]       = useState('local');
  const [vpsServers, setVpsServers] = useState([]);
  const [activeVps,  setActiveVps]  = useState('');
  const [status,     setStatus]     = useState('Connecting…');

  // ── Init xterm.js ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || termRef.current) return;

    const term = new Terminal({
      theme: {
        background: '#0d1117', foreground: '#e6edf3', cursor: '#58a6ff',
        selectionBackground: 'rgba(88,166,255,0.25)',
        black: '#484f58', red: '#ff7b72', green: '#3fb950', yellow: '#d29922',
        blue: '#58a6ff', magenta: '#bc8cff', cyan: '#39c5cf', white: '#b1bac4',
        brightBlack: '#6e7681', brightRed: '#ffa198', brightGreen: '#56d364',
        brightYellow: '#e3b341', brightBlue: '#79c0ff', brightMagenta: '#d2a8ff',
        brightCyan: '#56d364', brightWhite: '#f0f6fc'
      },
      fontFamily: '"JetBrains Mono","Fira Code","Cascadia Code",Menlo,monospace',
      fontSize: 13, lineHeight: 1.4, cursorBlink: true,
      scrollback: 5000, allowProposedApi: true
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
      dataDisposable.current?.dispose();
      term.dispose();
      termRef.current = null;
    };
  }, []);

  // ── Bind xterm input to WebSocket ─────────────────────────────────────────
  function bindInput(ws) {
    // Dispose previous listener to prevent stacking
    dataDisposable.current?.dispose();
    dataDisposable.current = null;

    if (!termRef.current) return;
    dataDisposable.current = termRef.current.onData(data => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'input', data }));
      }
    });
  }

  // ── Local shell WebSocket ──────────────────────────────────────────────────
  const connectLocalWS = useCallback(() => {
    if (modeRef.current !== 'local') return;

    const token = getToken();
    if (!token) { setStatus('Not authenticated'); return; }

    clearTimeout(reconnectTimer.current);
    manualClose.current = false;

    // Close previous socket cleanly
    const prev = wsRef.current;
    if (prev && prev.readyState !== WebSocket.CLOSED) {
      prev.onclose = null; // suppress auto-reconnect from old socket
      prev.close();
    }

    const wsUrl = buildWsUrl(`/ws/terminal?token=${encodeURIComponent(token)}&sessionId=${sessionId.current}`);
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    setStatus('Connecting…');

    ws.onopen = () => {
      reconnectCount.current = 0;
      setConnected(true);
      setStatus('Connected');
      bindInput(ws);
    };

    ws.onclose = (ev) => {
      setConnected(false);
      if (manualClose.current || modeRef.current !== 'local') return;

      if (reconnectCount.current >= MAX_RECONNECT_ATTEMPTS) {
        setStatus('Could not reconnect — click Reconnect to retry');
        termRef.current?.writeln('\r\n\x1b[31m[Max reconnect attempts reached — click Reconnect]\x1b[0m');
        return;
      }

      const delay = Math.min(RECONNECT_BASE_MS * Math.pow(1.5, reconnectCount.current), RECONNECT_MAX_MS);
      reconnectCount.current += 1;
      setStatus(`Disconnected — reconnecting in ${Math.round(delay / 1000)}s… (${reconnectCount.current}/${MAX_RECONNECT_ATTEMPTS})`);
      termRef.current?.writeln(`\r\n\x1b[33m[Disconnected — reconnecting in ${Math.round(delay / 1000)}s]\x1b[0m`);
      reconnectTimer.current = setTimeout(connectLocalWS, delay);
    };

    ws.onerror = () => setStatus('Connection error');

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        switch (msg.type) {
          case 'output': termRef.current?.write(msg.data); break;
          case 'exit':
            termRef.current?.writeln(`\r\n\x1b[33m[Process exited: ${msg.data?.code}]\x1b[0m`);
            // Offer restart after exit
            termRef.current?.writeln(`\x1b[90m[Send any key or click Reconnect to start a new shell]\x1b[0m\r\n`);
            setStatus('Shell exited — press Reconnect');
            break;
          case 'error':  termRef.current?.writeln(`\r\n\x1b[31m[Error: ${msg.data}]\x1b[0m`); break;
          case 'ready':  termRef.current?.writeln(`\x1b[32m[Shell ready — ${msg.data?.cwd}]\x1b[0m\r\n`); break;
          case 'ping':   ws.send(JSON.stringify({ type: 'pong' })); break;
        }
      } catch {}
    };
  }, []);

  // ── VPS SSH WebSocket ──────────────────────────────────────────────────────
  const connectVpsWS = useCallback((serverId) => {
    if (!serverId) return;
    const token = getToken();
    if (!token) { setStatus('Not authenticated'); return; }

    const prev = wsRef.current;
    if (prev && prev.readyState !== WebSocket.CLOSED) {
      prev.onclose = null;
      prev.close();
    }

    setConnected(false);
    setStatus('Connecting to VPS…');

    const wsUrl = buildWsUrl(`/ws/vps/${serverId}?token=${encodeURIComponent(token)}`);
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => { setConnected(true); setStatus('VPS Connected'); bindInput(ws); };
    ws.onclose = () => { setConnected(false); setStatus('VPS Disconnected'); termRef.current?.writeln('\r\n\x1b[33m[VPS session closed]\x1b[0m'); };
    ws.onerror = () => setStatus('VPS connection error');
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        switch (msg.type) {
          case 'output': termRef.current?.write(msg.data); break;
          case 'error':  termRef.current?.writeln(`\r\n\x1b[31m[VPS Error: ${msg.data}]\x1b[0m`); break;
          case 'ready':  termRef.current?.writeln(`\x1b[32m[VPS shell ready]\x1b[0m\r\n`); break;
          case 'closed': termRef.current?.writeln(`\r\n\x1b[33m[VPS connection closed]\x1b[0m`); break;
          case 'ping':   ws.send(JSON.stringify({ type: 'pong' })); break;
        }
      } catch {}
    };
  }, []);

  // ── Mode: local ────────────────────────────────────────────────────────────
  useEffect(() => {
    modeRef.current = mode;
    if (mode !== 'local') return;
    reconnectCount.current = 0;
    connectLocalWS();
    return () => {
      clearTimeout(reconnectTimer.current);
      manualClose.current = true;
      wsRef.current?.close();
    };
  }, [mode, connectLocalWS]);

  // ── Mode: vps — load server list ───────────────────────────────────────────
  useEffect(() => {
    if (mode !== 'vps') return;
    manualClose.current = true;
    wsRef.current?.close();
    setConnected(false);
    setStatus('Select a VPS server');
    fetch('/vps/servers', { headers: authHeaders() })
      .then(r => r.ok ? r.json() : [])
      .then(data => {
        const list = Array.isArray(data) ? data : [];
        setVpsServers(list);
        if (list.length) { setActiveVps(list[0].id); connectVpsWS(list[0].id); }
      })
      .catch(() => {});
  }, [mode, connectVpsWS]);

  function handleModeSwitch(newMode) {
    manualClose.current = true;
    clearTimeout(reconnectTimer.current);
    wsRef.current?.close();
    termRef.current?.clear();
    termRef.current?.writeln(`\x1b[34m[Switched to ${newMode} mode]\x1b[0m\r\n`);
    setMode(newMode);
  }

  function handleVpsChange(serverId) {
    setActiveVps(serverId);
    termRef.current?.clear();
    connectVpsWS(serverId);
  }

  function handleReconnect() {
    reconnectCount.current = 0;
    clearTimeout(reconnectTimer.current);
    termRef.current?.writeln('\x1b[34m[Manual reconnect…]\x1b[0m\r\n');
    if (mode === 'local') connectLocalWS();
    else if (activeVps)   connectVpsWS(activeVps);
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
            <button className="ghost-btn" onClick={handleReconnect} title="Reconnect">Reconnect</button>
            <div className="mode-tabs">
              <button className={`mode-tab ${mode === 'local' ? 'active' : ''}`}
                onClick={() => handleModeSwitch('local')}>Local</button>
              <button className={`mode-tab ${mode === 'vps' ? 'active' : ''}`}
                onClick={() => handleModeSwitch('vps')}>VPS / SSH</button>
            </div>
          </div>
        </div>

        {mode === 'vps' && vpsServers.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
            <select className="field-input"
              style={{ fontSize: 13, padding: '5px 10px', flex: 1 }}
              value={activeVps} onChange={e => handleVpsChange(e.target.value)}>
              {vpsServers.map(s => (
                <option key={s.id} value={s.id}>{s.label} — {s.username}@{s.host}</option>
              ))}
            </select>
            {activeVpsInfo && (
              <span style={{ fontSize: 12, color: connected ? '#3fb950' : '#8b949e', whiteSpace: 'nowrap' }}>
                ● {connected ? 'Connected' : 'Disconnected'}
              </span>
            )}
          </div>
        )}
        {mode === 'vps' && vpsServers.length === 0 && (
          <p className="muted" style={{ marginTop: 8 }}>
            No VPS servers saved. Add one in the VPS Servers tab first.
          </p>
        )}
      </div>

      <div ref={containerRef}
        style={{ flex: 1, minHeight: 0, background: '#0d1117', borderRadius: 6, overflow: 'hidden' }}
      />
    </div>
  );
}
