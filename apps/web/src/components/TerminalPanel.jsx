import { useState, useRef, useEffect } from 'react';
import './Panel.css';
import './TerminalPanel.css';

export default function TerminalPanel() {
  const [mode, setMode]         = useState('local');  // 'local' | 'vps'
  const [sessions, setSessions] = useState([]);
  const [activeSession, setActiveSession] = useState('');
  const [lines, setLines]       = useState([{ text: 'Apex Dev Terminal  —  type a command and press Enter', type: 'info' }]);
  const [cmd, setCmd]           = useState('');
  const [running, setRunning]   = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines]);

  // Load VPS sessions when switching to VPS mode
  useEffect(() => {
    if (mode === 'vps') {
      fetch('/vps/sessions').then(r => r.json())
        .then(data => { setSessions(data); if (data.length) setActiveSession(data[0].id); })
        .catch(() => {});
    }
  }, [mode]);

  function addLine(text, type = 'out') {
    setLines(prev => [...prev, { text, type }]);
  }

  async function runCommand() {
    const c = cmd.trim();
    if (!c || running) return;
    addLine(`$ ${c}`, 'cmd');
    setCmd('');
    setRunning(true);

    try {
      if (mode === 'local') {
        const res = await fetch('/shell/execute', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command: c })
        });
        const data = await res.json();
        const out = data.stdout || data.output || '';
        const err = data.stderr || data.error || '';
        if (out) out.split('\n').forEach(l => addLine(l, 'out'));
        if (err) err.split('\n').forEach(l => addLine(l, 'err'));
        if (!out && !err) addLine('(no output)', 'info');
      } else {
        if (!activeSession) { addLine('No VPS session selected.', 'err'); return; }
        const res = await fetch('/vps/exec', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: activeSession, command: c })
        });
        const data = await res.json();
        if (data.error) { addLine(data.error, 'err'); return; }
        if (data.stdout) data.stdout.split('\n').forEach(l => addLine(l, 'out'));
        if (data.stderr) data.stderr.split('\n').forEach(l => addLine(l, 'err'));
        if (!data.stdout && !data.stderr) addLine('(no output)', 'info');
      }
    } catch (e) {
      addLine(`[error] ${e.message}`, 'err');
    } finally {
      setRunning(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') { e.preventDefault(); runCommand(); }
  }

  const activeLabel = sessions.find(s => s.id === activeSession);

  return (
    <div className="panel terminal-panel">
      <div className="panel-title" style={{ paddingBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2>Terminal</h2>
          <div className="mode-tabs">
            <button className={`mode-tab ${mode === 'local' ? 'active' : ''}`} onClick={() => setMode('local')}>Local</button>
            <button className={`mode-tab ${mode === 'vps' ? 'active' : ''}`} onClick={() => setMode('vps')}>VPS / SSH</button>
          </div>
        </div>
        {mode === 'vps' && sessions.length > 0 && (
          <select className="field-input" style={{ marginTop: 10, fontSize: 13, padding: '5px 10px' }}
            value={activeSession} onChange={e => setActiveSession(e.target.value)}>
            {sessions.map(s => (
              <option key={s.id} value={s.id}>{s.label} — {s.username}@{s.host}</option>
            ))}
          </select>
        )}
        {mode === 'vps' && sessions.length === 0 && (
          <p className="muted" style={{ marginTop: 8 }}>No VPS sessions saved. Add one in the SSH Keys tab.</p>
        )}
        {mode === 'vps' && activeLabel && (
          <p style={{ fontSize: 12, color: '#3fb950', marginTop: 6 }}>● Connected to {activeLabel.label}</p>
        )}
      </div>

      <div className="terminal-output">
        {lines.map((l, i) => (
          <div key={i} className={`term-line ${l.type}`}>{l.text}</div>
        ))}
        {running && <div className="term-line info">running…</div>}
        <div ref={bottomRef} />
      </div>

      <div className="terminal-input-row">
        <span className="term-prompt">{mode === 'vps' && activeLabel ? `${activeLabel.username}@${activeLabel.host}` : 'local'} $</span>
        <input className="term-input" value={cmd} onChange={e => setCmd(e.target.value)}
          onKeyDown={handleKeyDown} placeholder="Enter command…" disabled={running}
          autoFocus />
        <button className="term-run-btn" onClick={runCommand} disabled={running}>
          {running ? '…' : 'Run'}
        </button>
      </div>
    </div>
  );
}
