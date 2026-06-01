import { useState, useEffect, useCallback } from 'react';
import { authHeaders } from '../hooks/useAuth';
import './Panel.css';

const STATUS_COLOR = {
  running: '#3fb950',
  online:  '#3fb950',
  failed:  '#f85149',
  errored: '#f85149',
  stopped: '#8b949e',
  pending: '#d29922',
  unknown: '#8b949e',
};

function statusLabel(s) {
  if (s === 'online')  return 'running';
  if (s === 'errored') return 'failed';
  return s || 'unknown';
}

export default function DeploymentPanel() {
  const [deployments, setDeployments] = useState([]);
  const [sysStatus,   setSysStatus]   = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState(null);

  const refresh = useCallback(async () => {
    try {
      const [deplRes, sysRes] = await Promise.all([
        fetch('/deployment/list', { headers: authHeaders() }),
        fetch('/system/status',   { headers: authHeaders() })
      ]);
      if (deplRes.ok) setDeployments(await deplRes.json().then(d => Array.isArray(d) ? d : []));
      if (sysRes.ok)  setSysStatus(await sysRes.json());
      setError(null);
    } catch (e) {
      setError(`Could not load deployment data (${e})`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 15000);
    return () => clearInterval(interval);
  }, [refresh]);

  return (
    <div className="panel">
      <div className="panel-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2>Deployment Dashboard</h2>
          <p>VPS and infrastructure deployment monitoring</p>
        </div>
        <button className="ghost-btn" onClick={refresh} style={{ fontSize: 11 }}>Refresh</button>
      </div>

      {loading && <p className="muted">Loading…</p>}
      {error   && <p className="error-text">{error}</p>}

      {/* System metrics */}
      {sysStatus && (
        <div className="info-card" style={{ marginBottom: 16 }}>
          <div className="info-card-header">
            <span className="info-card-title">🖥️ {sysStatus.hostname}</span>
            <span className="info-badge" style={{ color: '#3fb950' }}>● online</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8, marginTop: 8 }}>
            <div className="info-row"><span>CPU</span><span>{sysStatus.cpu?.cores} cores · load {sysStatus.cpu?.loadAvg?.[0]}</span></div>
            <div className="info-row"><span>Memory</span><span>{sysStatus.memory?.used} / {sysStatus.memory?.total}</span></div>
            {sysStatus.disk && <div className="info-row"><span>Disk</span><span>{sysStatus.disk.used} / {sysStatus.disk.total} ({sysStatus.disk.percent})</span></div>}
            <div className="info-row"><span>Uptime</span><span>{Math.floor((sysStatus.uptime?.process || 0) / 60)}m process</span></div>
          </div>
        </div>
      )}

      {/* PM2 processes from system status */}
      {sysStatus?.pm2?.length > 0 && (
        <>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: '#8b949e', margin: '16px 0 8px' }}>PM2 Processes</h3>
          <div className="card-list">
            {sysStatus.pm2.map((p, i) => (
              <div key={i} className="info-card">
                <div className="info-card-header">
                  <span className="info-card-title">⚡ {p.name}</span>
                  <span className="info-badge" style={{ color: STATUS_COLOR[p.status] || STATUS_COLOR.unknown }}>
                    ● {statusLabel(p.status)}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 16, fontSize: 12, color: '#8b949e', marginTop: 6 }}>
                  {p.cpu    && <span>CPU {p.cpu}</span>}
                  {p.memory && <span>MEM {p.memory}</span>}
                  {p.restarts > 0 && <span>{p.restarts} restarts</span>}
                  {p.pid    && <span>PID {p.pid}</span>}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Services from deployment/list */}
      {deployments.length > 0 && (
        <>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: '#8b949e', margin: '16px 0 8px' }}>Services</h3>
          <div className="card-list">
            {deployments.map((d, i) => (
              <div key={i} className="info-card">
                <div className="info-card-header">
                  <span className="info-card-title">{d.name || d.id || `Service ${i + 1}`}</span>
                  <span className="info-badge" style={{ color: STATUS_COLOR[d.status] || STATUS_COLOR.unknown }}>
                    ● {statusLabel(d.status)}
                  </span>
                </div>
                {d.server && <div className="info-row"><span>Server</span><span>{d.server}</span></div>}
                {(d.createdAt || d.created_at) && (
                  <div className="info-row">
                    <span>Started</span>
                    <span>{new Date(d.createdAt || d.created_at).toLocaleString()}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {!loading && !error && deployments.length === 0 && !sysStatus?.pm2?.length && (
        <p className="muted">No services detected. Deploy something from the Chat tab, or start PM2 processes on the server.</p>
      )}
    </div>
  );
}
