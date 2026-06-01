import { useState, useEffect } from 'react';
import { authHeaders } from '../hooks/useAuth';
import './Panel.css';
import './RollbackPanel.css';

const TYPE_COLORS = {
  deployment:   '#56d364',
  self_edit:    '#e3b341',
  config_change:'#58a6ff',
  manual:       '#8b949e',
  vps_change:   '#bc8cff'
};

export default function RollbackPanel() {
  const [checkpoints, setCheckpoints]   = useState([]);
  const [loading, setLoading]           = useState(false);
  const [restoring, setRestoring]       = useState(null);
  const [restoreResult, setRestoreResult] = useState(null);
  const [showCreate, setShowCreate]     = useState(false);
  const [newLabel, setNewLabel]         = useState('');
  const [creating, setCreating]         = useState(false);
  const [error, setError]               = useState('');

  async function fetchCheckpoints() {
    setLoading(true);
    try {
      const res = await fetch('/rollback/checkpoints?limit=30', { headers: authHeaders() });
      if (res.ok) setCheckpoints(await res.json());
    } catch {}
    setLoading(false);
  }

  useEffect(() => { fetchCheckpoints(); }, []);

  async function handleCreate(e) {
    e.preventDefault();
    if (!newLabel) return;
    setCreating(true); setError('');
    try {
      const res = await fetch('/rollback/checkpoints', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ label: newLabel, type: 'manual' })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setNewLabel('');
      setShowCreate(false);
      await fetchCheckpoints();
    } catch (err) {
      setError(err.message);
    }
    setCreating(false);
  }

  async function handleRestore(cp) {
    if (!window.confirm(`Restore to checkpoint "${cp.label}"?\n\nThis will:\n• Checkout git SHA: ${cp.git_sha || 'none'}\n• Restore PM2 process states\n\nThis cannot be undone automatically.`)) return;
    setRestoring(cp.id); setRestoreResult(null); setError('');
    try {
      const res = await fetch(`/rollback/checkpoints/${cp.id}/restore`, {
        method: 'POST', headers: authHeaders()
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setRestoreResult(data);
    } catch (err) {
      setError(err.message);
    }
    setRestoring(null);
  }

  async function handleDelete(cp) {
    if (!window.confirm(`Delete checkpoint "${cp.label}"?`)) return;
    await fetch(`/rollback/checkpoints/${cp.id}`, { method: 'DELETE', headers: authHeaders() });
    setCheckpoints(c => c.filter(x => x.id !== cp.id));
  }

  function fmt(date) {
    if (!date) return '';
    const d = new Date(date);
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  return (
    <div className="panel">
      <div className="panel-title">
        <h2>Rollback &amp; Checkpoints</h2>
        <p>Snapshot system state before deployments and self-edits. Restore to any point.</p>
      </div>

      <div className="rb-toolbar">
        <button className="primary-btn" onClick={() => setShowCreate(v => !v)}>
          {showCreate ? 'Cancel' : '+ Create Checkpoint'}
        </button>
        <button className="ghost-btn" onClick={fetchCheckpoints} disabled={loading}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {showCreate && (
        <form className="rb-create-form" onSubmit={handleCreate}>
          <label className="field-label">Checkpoint label</label>
          <div style={{ display: 'flex', gap: 10 }}>
            <input className="field-input" style={{ flex: 1 }}
              placeholder="e.g. Before deploying v2.1"
              value={newLabel} onChange={e => setNewLabel(e.target.value)} required />
            <button type="submit" className="primary-btn" disabled={creating}>
              {creating ? 'Creating…' : 'Create'}
            </button>
          </div>
          {error && <p className="error-text">{error}</p>}
          <p className="muted" style={{ marginTop: 6 }}>
            Captures current git SHA and PM2 process states.
          </p>
        </form>
      )}

      {restoreResult && (
        <div className="rb-result">
          <div className="rb-result-header">
            <span className="rb-result-icon">✓</span>
            Restored to <strong>{restoreResult.label}</strong>
          </div>
          <div className="rb-result-steps">
            {(restoreResult.results || []).map((r, i) => (
              <div key={i} className={`rb-result-step ${r.status}`}>
                <span>{r.status === 'done' ? '✓' : '✗'}</span>
                <span>{r.step}</span>
                {r.error && <span className="rb-step-err">{r.error}</span>}
              </div>
            ))}
          </div>
          <button className="ghost-btn" onClick={() => setRestoreResult(null)}>Dismiss</button>
        </div>
      )}

      {error && !showCreate && <p className="error-text">{error}</p>}

      {checkpoints.length === 0 && !loading && (
        <div className="rb-empty">
          <span>No checkpoints yet.</span>
          <p>Checkpoints are created automatically before deployments and self-edits, or manually above.</p>
        </div>
      )}

      <div className="card-list">
        {checkpoints.map(cp => (
          <div key={cp.id} className="rb-card">
            <div className="rb-card-top">
              <div>
                <span className="rb-type-badge" style={{ background: (TYPE_COLORS[cp.type] || '#8b949e') + '22', color: TYPE_COLORS[cp.type] || '#8b949e' }}>
                  {cp.type}
                </span>
                <span className="rb-card-label">{cp.label}</span>
              </div>
              <div className="rb-card-btns">
                <button
                  className="primary-btn rb-restore-btn"
                  disabled={restoring === cp.id}
                  onClick={() => handleRestore(cp)}>
                  {restoring === cp.id ? 'Restoring…' : 'Restore'}
                </button>
                <button className="ghost-btn danger" onClick={() => handleDelete(cp)}>Del</button>
              </div>
            </div>
            <div className="rb-card-meta">
              <span>{fmt(cp.created_at)}</span>
              {cp.git_sha && <span>SHA: <code>{cp.git_sha.slice(0, 8)}</code></span>}
              {cp.server_id && <span>Server: {cp.server_id}</span>}
              {cp.repo_name && <span>Repo: {cp.repo_name}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
