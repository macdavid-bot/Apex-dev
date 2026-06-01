import { useState, useEffect, useCallback } from 'react';
import { authHeaders } from '../hooks/useAuth';
import './Panel.css';

const STATUS_COLOR = {
  completed: '#3fb950',
  running:   '#58a6ff',
  failed:    '#f85149',
  pending:   '#8b949e',
};

function formatRelative(dateStr) {
  if (!dateStr) return '';
  const diff = (Date.now() - new Date(dateStr)) / 1000;
  if (diff < 60)    return 'just now';
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function WorkflowTimeline() {
  const [workflows, setWorkflows] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);

  const fetchWorkflows = useCallback(async () => {
    try {
      const res = await fetch('/workflow', { headers: authHeaders() });
      if (!res.ok) throw new Error(res.status);
      const data = await res.json();
      setWorkflows(Array.isArray(data) ? data : []);
      setError(null);
    } catch (e) {
      setError(`Could not load workflows (${e})`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWorkflows();
    const interval = setInterval(fetchWorkflows, 5000);
    return () => clearInterval(interval);
  }, [fetchWorkflows]);

  const running   = workflows.filter(w => w.status === 'running');
  const completed = workflows.filter(w => w.status === 'completed');
  const failed    = workflows.filter(w => w.status === 'failed');

  return (
    <div className="panel">
      <div className="panel-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2>Workflow Timeline</h2>
          <p>Active and historical engineering workflows</p>
        </div>
        <div style={{ display: 'flex', gap: 12, fontSize: 12, color: '#8b949e', marginTop: 4 }}>
          {running.length   > 0 && <span style={{ color: STATUS_COLOR.running   }}>● {running.length} running</span>}
          {failed.length    > 0 && <span style={{ color: STATUS_COLOR.failed    }}>● {failed.length} failed</span>}
          {completed.length > 0 && <span style={{ color: STATUS_COLOR.completed }}>✓ {completed.length} done</span>}
          <button className="ghost-btn" onClick={fetchWorkflows} style={{ fontSize: 11 }}>Refresh</button>
        </div>
      </div>

      {loading && <p className="muted">Loading workflows…</p>}
      {error   && <p className="error-text">{error}</p>}
      {!loading && !error && workflows.length === 0 && (
        <p className="muted">No workflows yet. Start one from the Chat tab.</p>
      )}

      <div className="timeline">
        {workflows.map((wf) => (
          <div key={wf.id} className="timeline-item">
            <div
              className="timeline-dot"
              style={{ background: STATUS_COLOR[wf.status] || STATUS_COLOR.pending }}
            />
            <div className="timeline-body">
              <div className="timeline-title">{wf.title || wf.id}</div>
              <div className="timeline-meta">
                <span style={{ color: STATUS_COLOR[wf.status] || STATUS_COLOR.pending }}>
                  {wf.status === 'running' ? '⟳ ' : ''}{wf.status || 'pending'}
                </span>
                {(wf.createdAt || wf.created_at) && (
                  <span> · {formatRelative(wf.createdAt || wf.created_at)}</span>
                )}
                {wf.type && wf.type !== 'task' && (
                  <span style={{ color: '#8b949e' }}> · {wf.type}</span>
                )}
              </div>
              {wf.description && <div className="timeline-desc">{wf.description}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
