import { useState, useEffect } from 'react';
import './Panel.css';

const STATUS_COLOR = { running: '#3fb950', failed: '#f85149', pending: '#d29922', stopped: '#8b949e' };

export default function DeploymentPanel() {
  const [deployments, setDeployments] = useState([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState(null);

  useEffect(() => {
    fetch('/deployment/list')
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(data => setDeployments(Array.isArray(data) ? data : []))
      .catch(e => setError(`Could not load deployments (${e})`))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="panel">
      <div className="panel-title">
        <h2>Deployment Dashboard</h2>
        <p>VPS and infrastructure deployment monitoring</p>
      </div>

      {loading && <p className="muted">Loading deployments…</p>}
      {error   && <p className="error-text">{error}</p>}

      {!loading && !error && deployments.length === 0 && (
        <p className="muted">No deployments yet. Use the Chat tab to ask Apex Dev to deploy to a server.</p>
      )}

      <div className="card-list">
        {deployments.map((d, i) => (
          <div key={i} className="info-card">
            <div className="info-card-header">
              <span className="info-card-title">{d.name || d.id || `Deployment ${i + 1}`}</span>
              <span className="info-badge" style={{ color: STATUS_COLOR[d.status] || STATUS_COLOR.stopped }}>
                ● {d.status || 'unknown'}
              </span>
            </div>
            {d.server  && <div className="info-row"><span>Server</span><span>{d.server}</span></div>}
            {d.createdAt && <div className="info-row"><span>Deployed</span><span>{new Date(d.createdAt).toLocaleString()}</span></div>}
          </div>
        ))}
      </div>
    </div>
  );
}
