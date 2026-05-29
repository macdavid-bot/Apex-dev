import { useState, useRef, useEffect } from 'react';
import './Panel.css';
import './TerminalPanel.css';

export default function TerminalPanel() {
  const [lines, setLines]   = useState(['Apex Dev Terminal — type a command and press Enter']);
  const [cmd, setCmd]       = useState('');
  const [running, setRunning] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines]);

  async function runCommand() {
    const c = cmd.trim();
    if (!c || running) return;
    setLines(prev => [...prev, `$ ${c}`]);
    setCmd('');
    setRunning(true);
    try {
      const res = await fetch('/shell/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: c })
      });
      const data = await res.json();
      const out = data.stdout || data.output || data.result || '';
      const err = data.stderr || data.error || '';
      if (out) setLines(prev => [...prev, ...out.split('\n')]);
      if (err) setLines(prev => [...prev, ...err.split('\n').map(l => `[err] ${l}`)]);
      if (!out && !err) setLines(prev => [...prev, '(no output)']);
    } catch {
      setLines(prev => [...prev, '[error] Could not reach shell API']);
    } finally {
      setRunning(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') { e.preventDefault(); runCommand(); }
  }

  return (
    <div className="panel terminal-panel">
      <div className="panel-title">
        <h2>Terminal</h2>
        <p>Execute shell commands via the backend API</p>
      </div>
      <div className="terminal-output">
        {lines.map((l, i) => (
          <div key={i} className={`term-line ${l.startsWith('[err]') ? 'err' : ''}`}>{l}</div>
        ))}
        {running && <div className="term-line muted">running…</div>}
        <div ref={bottomRef} />
      </div>
      <div className="terminal-input-row">
        <span className="term-prompt">$</span>
        <input
          className="term-input"
          value={cmd}
          onChange={e => setCmd(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Enter command…"
          disabled={running}
          autoFocus
        />
        <button className="term-run-btn" onClick={runCommand} disabled={running}>
          {running ? '…' : 'Run'}
        </button>
      </div>
    </div>
  );
}
