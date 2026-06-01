import { useState } from 'react';
import { authHeaders } from '../hooks/useAuth';
import './Panel.css';

const CHECK_ICONS = { true: '✓', false: '✗' };
const CHECK_COLORS = { true: '#3fb950', false: '#f85149' };

export default function ValidationPanel() {
  const [target,  setTarget]  = useState('.');
  const [result,  setResult]  = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  async function handleValidate() {
    if (!target.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/validation/run', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body:    JSON.stringify({ target })
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
        <p>Run code health checks, linting, and environment diagnostics</p>
      </div>

      <div className="input-row">
        <input
          className="field-input"
          placeholder="Path to validate (e.g. . or /var/www/myapp)"
          value={target}
          onChange={e => setTarget(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleValidate()}
        />
        <button className="primary-btn" onClick={handleValidate} disabled={loading}>
          {loading ? 'Running…' : 'Validate'}
        </button>
      </div>

      {error && <p className="error-text">{error}</p>}

      {result && (
        <div style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <span style={{
              fontSize: 14, fontWeight: 700,
              color: result.success ? '#3fb950' : '#f85149'
            }}>
              {result.success ? '✓ All checks passed' : '✗ Some checks failed'}
            </span>
            <span style={{ fontSize: 12, color: '#8b949e' }}>{result.target}</span>
          </div>

          <div className="card-list">
            {(result.checks || []).map((check, i) => (
              <div key={i} className="info-card" style={{ padding: '10px 14px' }}>
                <div className="info-card-header">
                  <span style={{ fontWeight: 600, fontSize: 13 }}>
                    <span style={{ color: CHECK_COLORS[check.success], marginRight: 6 }}>
                      {CHECK_ICONS[check.success]}
                    </span>
                    {check.label || check.name}
                  </span>
                  <span style={{ fontSize: 12, color: '#8b949e' }}>{check.output}</span>
                </div>
              </div>
            ))}
          </div>

          {result.completedAt && (
            <p style={{ fontSize: 11, color: '#8b949e', marginTop: 10 }}>
              Completed {new Date(result.completedAt).toLocaleString()}
            </p>
          )}
        </div>
      )}

      {!result && !loading && !error && (
        <p className="muted" style={{ marginTop: 12 }}>
          Enter a directory path to run health checks: path existence, package.json, installed dependencies, lint, and required environment variables.
        </p>
      )}
    </div>
  );
}
