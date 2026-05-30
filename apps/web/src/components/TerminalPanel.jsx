import { useState, useRef, useEffect, useCallback, useId } from 'react';
import './Panel.css';
import './TerminalPanel.css';

const MAX_LINES = 2000;

export default function TerminalPanel() {
  const rawId = useId();
  const sessionId = useRef('term-' + rawId.replace(/:/g, ''));

  const [mode, setMode]               = useState('local');  // 'local' | 'vps'
  const [vpsSessions, setVpsSessions] = useState([]);
  const [activeVps, setActiveVps]     = useState('');
  const [lines, setLines]             = useState([
    { text: 'Apex Dev Terminal  —  type a command and press Enter', type: 'info' },
    { text: 'Supports: cd, history (↑↓), clear, local & VPS execution', type: 'info' },
  ]);
  const [cmd, setCmd]     = useState('');
  const [running, setRunning] = useState(false);
  const [cwd, setCwd]     = useState('~');
  const [history, setHistory] = useState([]);
  const [histIdx, setHistIdx] = useState(-1);
  const bottomRef  = useRef(null);
  const inputRef   = useRef(null);

  // ── Auto-scroll on new output ─────────────────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines]);

  // ── Initialize local shell session ────────────────────────────────────────
  useEffect(() => {
    fetch(`/shell/session/${sessionId.current}`)
      .then(r => r.json())
      .then(s => { if (s.cwd) setCwd(shortenCwd(s.cwd)); if (s.history) setHistory(s.history); })
      .catch(() => {});
  }, []);

  // ── Load VPS sessions when switching to VPS mode ─────────────────────────
  useEffect(() => {
    if (mode !== 'vps') return;
    fetch('/vps/sessions').then(r => r.json())
      .then(data => { setVpsSessions(data); if (data.length) setActiveVps(data[0].id); })
      .catch(() => {});
  }, [mode]);

  function shortenCwd(fullPath) {
    const home = fullPath.match(/^\/home\/[^/]+/) || fullPath.match(/^\/Users\/[^/]+/);
    if (home) return fullPath.replace(home[0], '~');
    return fullPath;
  }

  function addLines(newLines) {
    setLines(prev => {
      const combined = [...prev, ...newLines];
      return combined.length > MAX_LINES ? combined.slice(-MAX_LINES) : combined;
    });
  }

  function clearTerminal() {
    setLines([{ text: 'Terminal cleared.', type: 'info' }]);
  }

  // ── Execute a command ─────────────────────────────────────────────────────
  const runCommand = useCallback(async () => {
    const c = cmd.trim();
    if (!c || running) return;

    addLines([{ text: `${cwd} $ ${c}`, type: 'cmd' }]);
    setCmd('');
    setHistIdx(-1);
    setRunning(true);

    try {
      if (mode === 'local') {
        const res = await fetch(`/shell/session/${sessionId.current}/exec`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command: c })
        });
        const data = await res.json();

        if (data.clearScreen) { clearTerminal(); }
        else {
          const outLines = [];
          if (data.stdout) data.stdout.split('\n').forEach(l => outLines.push({ text: l, type: 'out' }));
          if (data.stderr) data.stderr.split('\n').filter(Boolean).forEach(l => outLines.push({ text: l, type: 'err' }));
          if (!data.stdout && !data.stderr) outLines.push({ text: '(no output)', type: 'info' });
          addLines(outLines);
        }

        if (data.cwd) setCwd(shortenCwd(data.cwd));
        // Refresh history from server after command
        setHistory(prev => c && prev.at(-1) !== c ? [...prev, c] : prev);

      } else {
        if (!activeVps) { addLines([{ text: 'No VPS session selected.', type: 'err' }]); return; }
        const res = await fetch('/vps/exec', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: activeVps, command: c })
        });
        const data = await res.json();
        if (data.error) { addLines([{ text: data.error, type: 'err' }]); return; }
        const outLines = [];
        if (data.stdout) data.stdout.split('\n').forEach(l => outLines.push({ text: l, type: 'out' }));
        if (data.stderr) data.stderr.split('\n').filter(Boolean).forEach(l => outLines.push({ text: l, type: 'err' }));
        if (!data.stdout && !data.stderr) outLines.push({ text: '(no output)', type: 'info' });
        addLines(outLines);
      }
    } catch (e) {
      addLines([{ text: `[error] ${e.message}`, type: 'err' }]);
    } finally {
      setRunning(false);
      inputRef.current?.focus();
    }
  }, [cmd, running, mode, activeVps, cwd]);

  // ── Keyboard: Enter, ↑, ↓, Ctrl+C, Ctrl+L ───────────────────────────────
  function handleKeyDown(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      runCommand();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHistIdx(prev => {
        const next = prev < history.length - 1 ? prev + 1 : prev;
        setCmd(history[history.length - 1 - next] || '');
        return next;
      });
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHistIdx(prev => {
        if (prev <= 0) { setCmd(''); return -1; }
        const next = prev - 1;
        setCmd(history[history.length - 1 - next] || '');
        return next;
      });
    } else if (e.key === 'l' && e.ctrlKey) {
      e.preventDefault();
      clearTerminal();
    } else if (e.key === 'c' && e.ctrlKey) {
      e.preventDefault();
      if (running) {
        addLines([{ text: '^C', type: 'err' }]);
        setRunning(false);
      } else {
        setCmd('');
        setHistIdx(-1);
      }
    }
  }

  const activeVpsInfo = vpsSessions.find(s => s.id === activeVps);
  const promptLabel = mode === 'vps' && activeVpsInfo
    ? `${activeVpsInfo.username}@${activeVpsInfo.host}`
    : `apex ${cwd}`;

  return (
    <div className="panel terminal-panel" onClick={() => inputRef.current?.focus()}>
      {/* ── Header ── */}
      <div className="panel-title" style={{ paddingBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h2>Terminal</h2>
            {mode === 'local' && (
              <span style={{ fontSize: 12, color: '#8b949e', fontFamily: 'monospace' }}>{cwd}</span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button className="ghost-btn" onClick={e => { e.stopPropagation(); clearTerminal(); }}
              title="Clear terminal (Ctrl+L)">Clear</button>
            <div className="mode-tabs">
              <button className={`mode-tab ${mode === 'local' ? 'active' : ''}`} onClick={() => setMode('local')}>Local</button>
              <button className={`mode-tab ${mode === 'vps' ? 'active' : ''}`} onClick={() => setMode('vps')}>VPS / SSH</button>
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
            {activeVpsInfo && (
              <span style={{ fontSize: 12, color: '#3fb950', whiteSpace: 'nowrap' }}>● Connected</span>
            )}
          </div>
        )}
        {mode === 'vps' && vpsSessions.length === 0 && (
          <p className="muted" style={{ marginTop: 8 }}>No VPS sessions saved. Add one in the SSH Keys tab.</p>
        )}
      </div>

      {/* ── Output ── */}
      <div className="terminal-output">
        {lines.map((l, i) => (
          <div key={i} className={`term-line ${l.type}`}>{l.text}</div>
        ))}
        {running && <div className="term-line info">running…  <span style={{ fontSize: 11 }}>(Ctrl+C to cancel)</span></div>}
        <div ref={bottomRef} />
      </div>

      {/* ── Input ── */}
      <div className="terminal-input-row">
        <span className="term-prompt">{promptLabel} $</span>
        <input
          ref={inputRef}
          className="term-input"
          value={cmd}
          onChange={e => { setCmd(e.target.value); setHistIdx(-1); }}
          onKeyDown={handleKeyDown}
          placeholder={running ? '' : 'Enter command…'}
          disabled={false}
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
        />
        <button className="term-run-btn" onClick={runCommand} disabled={running}>
          {running ? '…' : 'Run'}
        </button>
      </div>
    </div>
  );
}
