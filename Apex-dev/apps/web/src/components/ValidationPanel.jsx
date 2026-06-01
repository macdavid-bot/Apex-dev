import { useState } from 'react';
import './Panel.css';

export default function ValidationPanel() {
  const [target, setTarget]   = useState('');
  const [result, setResult]   = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);

  async function handleValidate() {
    if (!target.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/validation/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.status);
      setResult(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="panel">
      <div className="panel-title">
        <h2>Validation</h2>
        <p>Run code health checks and diagnostics</p>
      </div>

      <div className="input-row">
        <input
          className="field-input"
          placeholder="Path or repository to validate…"
          value={target}
          onChange={e => setTarget(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleValidate()}
        />
        <button className="primary-btn" onClick={handleValidate} disabled={loading}>
          {loading ? 'Running…' : 'Validate'}
        </button>
      </div>

      {error  && <p className="error-text">{error}</p>}

      {result && (
        <div className="result-block">
          <pre className="result-pre">{JSON.stringify(result, null, 2)}</pre>
        </div>
      )}

      {!result && !loading && !error && (
        <p className="muted">Enter a file path or repository to run validation checks, linting, and diagnostics.</p>
      )}
    </div>
  );
}
