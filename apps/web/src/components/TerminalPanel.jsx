import { useEffect, useRef, useState, useId } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import 'xterm/css/xterm.css';
import './Panel.css';
import './TerminalPanel.css';
import { getToken } from '../hooks/useAuth';

export default function TerminalPanel() {
  const rawId = useId();
  const sessionId = useRef('ws-term-' + rawId.replace(/:/g, ''));
  const containerRef = useRef(null);
  const termRef      = useRef(null);
  const wsRef        = useRef(null);
  const fitRef       = useRef(null);

  const [connected, setConnected]   = useState(false);
  const [mode, setMode]             = useState('local');   // 'local' | 'vps'
  const [vpsSessions, setVpsSessions] = useState([]);
  const [activeVps, setActiveVps]   = useState('');
  const [status, setStatus]         = useState('Connecting…');

  // ── Init xterm ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || termRef.current) return;

    const term = new Terminal({
      theme: {
        background:   '#0d1117',
        foreground:   '#e6edf3',
        cursor:       '#58a6ff',
        selectionBackground: 'rgba(88,166,255,0.25)',
        black:        '#484f58',
        red:          '#ff7b72',
        green:        '#3fb950',
        yellow:       '#d29922',
        blue:         '#58a6ff',
        magenta:      '#bc8cff',
        cyan:         '#39c5cf',
        white:        '#b1bac4',
        brightBlack:  '#6e7681',
        brightRed:    '#ffa198',
        brightGreen:  '#56d364',
        brightYellow: '#e3b341',
        brightBlue:   '#79c0ff',
        brightMagenta:'#d2a8ff',
        brightCyan:   '#56d364',
        brightWhite:  '#f0f6fc'
      },
      fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", Menlo, monospace',
      fontSize: 13,
      lineHeight: 1.4,
      cursorBlink: true,
      scrollback: 5000,
      allowProposedApi: true
    });

    const fitAddon = new FitAddon();
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

  // ── Connect WebSocket ──────────────────────────────────────────────────────
  useEffect(() => {
    if (mode !== 'local') return;
    connectWS();
    return () => wsRef.current?.close();
  }, [mode]);

  function connectWS() {
    const token = getToken();
    if (!token) { setStatus('Not authenticated'); return; }

    const wsUrl = `ws://${window.location.hostname}:3000/ws/terminal?token=${encodeURIComponent(token)}&sessionId=${sessionId.current}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    setStatus('Connecting…');

    ws.onopen = () => { setConnected(true); setStatus('Connected'); };
    ws.onclose = () => {
      setConnected(false);
      setStatus('Disconnected — reconnecting in 3s…');
      termRef.current?.writeln('\r\n\x1b[33m[Terminal disconnected — reconnecting…]\x1b[0m');
      setTimeout(() => { if (mode === 'local') connectWS(); }, 3000);
    };
    ws.onerror = () => { setStatus('Connection error'); };
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'output') {
          termRef.current?.write(msg.data);
        } else if (msg.type === 'exit') {
          termRef.current?.writeln(`\r\n\x1b[33m[Process exited with code ${msg.data.code}]\x1b[0m`);
        } else if (msg.type === 'error') {
          termRef.current?.writeln(`\r\n\x1b[31m[Error: ${msg.data}]\x1b[0m`);
        } else if (msg.type === 'ready') {
          termRef.current?.writeln(`\x1b[32m[Shell ready — ${msg.data.cwd}]\x1b[0m\r\n`);
        }
      } catch {}
    };

    // Send keystrokes to shell
    if (termRef.current) {
      termRef.current.onData(data => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'input', data }));
        }
      });
    }
  }

  // ── VPS mode ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (mode !== 'vps') return;
    wsRef.current?.close();
    setConnected(false);
    fetch('/vps/sessions', { headers: authHdr() })
      .then(r => r.json())
      .then(data => { setVpsSessions(data); if (data.length) setActiveVps(data[0].id); })
      .catch(() => {});
  }, [mode]);

  function authHdr() {
    const token = getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  async function runVpsCommand(cmd) {
    if (!activeVps || !cmd.trim()) return;
    const res = await fetch('/vps/exec', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHdr() },
      body: JSON.stringify({ sessionId: activeVps, command: cmd })
    });
    const data = await res.json();
    if (data.error) termRef.current?.writeln(`\r\n\x1b[31m${data.error}\x1b[0m`);
    else {
      if (data.stdout) termRef.current?.write(data.stdout);
      if (data.stderr) termRef.current?.write(`\x1b[31m${data.stderr}\x1b[0m`);
    }
  }

  function handleModeSwitch(newMode) {
    setMode(newMode);
    termRef.current?.clear();
    termRef.current?.writeln(`\x1b[34m[Switched to ${newMode} mode]\x1b[0m\r\n`);
  }

  const activeVpsInfo = vpsSessions.find(s => s.id === activeVps);

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
            <button className="ghost-btn" onClick={() => termRef.current?.clear()} title="Clear (Ctrl+L)">Clear</button>
            <div className="mode-tabs">
              <button className={`mode-tab ${mode === 'local' ? 'active' : ''}`} onClick={() => handleModeSwitch('local')}>Local</button>
              <button className={`mode-tab ${mode === 'vps' ? 'active' : ''}`} onClick={() => handleModeSwitch('vps')}>VPS / SSH</button>
            </div>
          </div>
        </div>

        {mode === 'vps' && vpsSessions.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
            <select className="field-input" style={{ fontSize: 13, padding: '5px 10px', flex: 1 }}
              value={activeVps} onChange={e => setActiveVps(e.target.value)}>
              {vpsSessions.map(s => (
                <option key={s.id} value={s.id}>{s.label} — {s.username}@{s.host}</option>
              ))}
            </select>
            {activeVpsInfo && <span style={{ fontSize: 12, color: '#3fb950', whiteSpace: 'nowrap' }}>● Connected</span>}
          </div>
        )}
        {mode === 'vps' && vpsSessions.length === 0 && (
          <p className="muted" style={{ marginTop: 8 }}>No VPS sessions saved. Add one in the SSH Keys tab.</p>
        )}
      </div>

      {/* xterm.js container */}
      <div
        ref={containerRef}
        style={{ flex: 1, minHeight: 0, background: '#0d1117', borderRadius: 6, overflow: 'hidden' }}
      />
    </div>
  );
}
