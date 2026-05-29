import { useState, useEffect } from 'react';
import './Panel.css';

const STATUS_COLOR = {
  completed: '#3fb950',
  running:   '#58a6ff',
  failed:    '#f85149',
  pending:   '#8b949e',
};

export default function WorkflowTimeline() {
  const [workflows, setWorkflows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch('/workflow')
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(data => setWorkflows(Array.isArray(data) ? data : []))
      .catch(e => setError(`Could not load workflows (${e})`))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="panel">
      <div className="panel-title">
        <h2>Workflow Timeline</h2>
        <p>Active and historical engineering workflows</p>
      </div>
      {loading && <p className="muted">Loading workflows…</p>}
      {error   && <p className="error-text">{error}</p>}
      {!loading && !error && workflows.length === 0 && (
        <p className="muted">No workflows found. Start one from the Chat tab.</p>
      )}
      <div className="timeline">
        {workflows.map((wf, i) => (
          <div key={i} className="timeline-item">
            <div
              className="timeline-dot"
              style={{ background: STATUS_COLOR[wf.status] || STATUS_COLOR.pending }}
            />
            <div className="timeline-body">
              <div className="timeline-title">{wf.title || wf.id || `Workflow ${i + 1}`}</div>
              <div className="timeline-meta">
                <span style={{ color: STATUS_COLOR[wf.status] || STATUS_COLOR.pending }}>
                  {wf.status || 'pending'}
                </span>
                {wf.createdAt && <span> · {new Date(wf.createdAt).toLocaleString()}</span>}
              </div>
              {wf.description && <div className="timeline-desc">{wf.description}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
