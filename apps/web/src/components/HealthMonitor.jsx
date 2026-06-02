import { useState, useEffect, useCallback } from 'react';
import { authHeaders } from '../hooks/useAuth';
import './Panel.css';
import './HealthMonitor.css';

export default function HealthMonitor() {
  const [configs,   setConfigs]   = useState([]);
  const [servers,   setServers]   = useState([]);
  const [alerts,    setAlerts]    = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [checking,  setChecking]  = useState(null);
  const [showForm,  setShowForm]  = useState(false);
  const [msg,       setMsg]       = useState(null);

  const [form, setForm] = useState({
    server_id: '', check_interval_sec: 60, alert_webhook: '', alert_email: '',
    pm2: true, nginx: true, disk: true, db: false, disk_threshold_pct: 80, app_port: 3000, db_url: ''
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cr, sr, ar] = await Promise.all([
        fetch('/health-monitor/configs', { headers: authHeaders() }).then(r => r.ok ? r.json() : []),
        fetch('/vps/servers', { headers: authHeaders() }).then(r => r.ok ? r.json() : []),
        fetch('/health-monitor/alerts', { headers: authHeaders() }).then(r => r.ok ? r.json() : [])
      ]);
      setConfigs(Array.isArray(cr) ? cr : []);
      const sl = Array.isArray(sr) ? sr : [];
      setServers(sl);
      if (sl.length && !form.server_id) setForm(f => ({ ...f, server_id: sl[0].id }));
      setAlerts(Array.isArray(ar) ? ar : []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleAdd(e) {
    e.preventDefault();
    if (!form.server_id) return setMsg({ type: 'error', text: 'VPS server is required' });

    setLoading(true);
    setMsg(null);
    try {
      const r = await fetch('/health-monitor/configs', {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          server_id: form.server_id,
          check_interval_sec: parseInt(form.check_interval_sec) || 60,
          alert_webhook: form.alert_webhook,
          alert_email: form.alert_email,
          checks: {
            pm2: form.pm2,
            nginx: form.nginx,
            disk: form.disk,
            db: form.db,
            disk_threshold_pct: parseInt(form.disk_threshold_pct) || 80,
            app_port: parseInt(form.app_port) || 3000,
            db_url: form.db_url
          }
        })
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Failed');
      setMsg({ type: 'ok', text: 'Monitor configured' });
      setShowForm(false);
      load();
    } catch (e) { setMsg({ type: 'error', text: e.message }); }
    setLoading(false);
  }

  async function runCheck(id) {
    setChecking(id);
    setMsg(null);
    try {
      const r = await fetch(`/health-monitor/configs/${id}/check`, {
        method: 'POST', headers: authHeaders()
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Check failed');
      const failed = data.checks?.filter(c => !c.ok) || [];
      if (failed.length) {
        setMsg({ type: 'error', text: `${failed.length} check(s) failed: ${failed.map(f => f.message).join(', ')}` });
      } else {
        setMsg({ type: 'ok', text: 'All checks passed ✓' });
      }
      load();
    } catch (e) { setMsg({ type: 'error', text: e.message }); }
    setChecking(null);
  }

  async function toggleEnabled(id, enabled) {
    try {
      await fetch(`/health-monitor/configs/${id}`, {
        method: 'PATCH', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !enabled })
      });
      load();
    } catch (e) { setMsg({ type: 'error', text: e.message }); }
  }

  async function removeConfig(id) {
    if (!confirm('Remove this monitor?')) return;
    try { await fetch(`/health-monitor/configs/${id}`, { method: 'DELETE', headers: authHeaders() }); load(); }
    catch (e) { setMsg({ type: 'error', text: e.message }); }
  }

  const statusDot = (ok) => ok ? { color: '#3fb950', text: '✓' } : { color: '#f85149', text: '✗' };

  return (
    <div className="panel health-panel">
      <div className="panel-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>💊 Health Monitor</h2>
        <button className="action-btn small" onClick={() => setShowForm(s => !s)}>
          {showForm ? 'Cancel' : '+ Add Monitor'}
        </button>
      </div>

      {msg && <div className={`health-msg ${msg.type}`}>{msg.text}</div>}

      {showForm && (
        <form className="health-form" onSubmit={handleAdd}>
          <div className="health-form-row">
            <div className="field-group" style={{ flex: 2 }}>
              <label className="field-label">VPS Server</label>
              <select className="field-input" value={form.server_id} onChange={e => setForm(f => ({ ...f, server_id: e.target.value }))}>
                <option value="">Select…</option>
                {servers.map(s => <option key={s.id} value={s.id}>{s.label} ({s.host})</option>)}
              </select>
            </div>
            <div className="field-group" style={{ flex: 1 }}>
              <label className="field-label">Interval (sec)</label>
              <input className="field-input" type="number" value={form.check_interval_sec}
                onChange={e => setForm(f => ({ ...f, check_interval_sec: e.target.value }))} />
            </div>
          </div>
          <div className="health-form-row">
            <div className="field-group" style={{ flex: 2 }}>
              <label className="field-label">Alert Webhook</label>
              <input className="field-input" placeholder="https://hooks.slack.com/..." value={form.alert_webhook}
                onChange={e => setForm(f => ({ ...f, alert_webhook: e.target.value }))} />
            </div>
            <div className="field-group" style={{ flex: 1 }}>
              <label className="field-label">Alert Email</label>
              <input className="field-input" placeholder="ops@example.com" value={form.alert_email}
                onChange={e => setForm(f => ({ ...f, alert_email: e.target.value }))} />
            </div>
          </div>
          <div className="health-form-row">
            {['pm2', 'nginx', 'disk', 'db', 'app_port'].map(name => (
              <label key={name} className="toggle-label">
                <input type="checkbox" checked={form[name]} onChange={e => setForm(f => ({ ...f, [name]: e.target.checked }))} />
                <span className="toggle-text">Check {name}</span>
              </label>
            ))}
          </div>
          <div className="health-form-row">
            <div className="field-group" style={{ flex: 1 }}>
              <label className="field-label">Disk Threshold %</label>
              <input className="field-input" type="number" value={form.disk_threshold_pct}
                onChange={e => setForm(f => ({ ...f, disk_threshold_pct: e.target.value }))} />
            </div>
            <div className="field-group" style={{ flex: 1 }}>
              <label className="field-label">App Port</label>
              <input className="field-input" type="number" value={form.app_port}
                onChange={e => setForm(f => ({ ...f, app_port: e.target.value }))} />
            </div>
            <div className="field-group" style={{ flex: 2 }}>
              <label className="field-label">DB URL</label>
              <input className="field-input" placeholder="postgresql://localhost/app" value={form.db_url}
                onChange={e => setForm(f => ({ ...f, db_url: e.target.value }))} />
            </div>
          </div>
          <button className="action-btn primary" type="submit" disabled={loading}>Save Monitor</button>
        </form>
      )}

      <div className="health-section">
        <h3 className="health-section-title">Configured Monitors</h3>
        {loading && !showForm && <p className="muted">Loading…</p>}
        {!loading && configs.length === 0 && <p className="muted">No monitors configured.</p>}
        {configs.map(c => {
          const server = servers.find(s => s.id === c.server_id);
          const checks = c.checks || {};
          return (
            <div key={c.id} className="health-monitor-card">
              <div className="health-monitor-main">
                <div className="health-monitor-header">
                  <span className="health-monitor-name">⚡ {server?.label || c.server_id}</span>
                  <span className={`health-badge ${c.enabled ? 'ok' : 'muted'}`}>
                    ● {c.enabled ? 'enabled' : 'disabled'}
                  </span>
                </div>
                <div className="health-monitor-meta">
                  <span>every {c.check_interval_sec}s</span>
                  {checks.pm2 && <span>PM2</span>}
                  {checks.nginx && <span>nginx</span>}
                  {checks.disk && <span>disk ≥{checks.disk_threshold_pct}%</span>}
                  {checks.db && <span>DB</span>}
                  {checks.app_port && <span>port {checks.app_port}</span>}
                  {c.alert_webhook && <span>webhook</span>}
                  {c.alert_email && <span>email</span>}
                </div>
              </div>
              <div className="health-monitor-actions">
                <button className="ghost-btn small" disabled={!!checking} onClick={() => runCheck(c.id)}>
                  {checking === c.id ? '…' : 'Run Check'}
                </button>
                <button className="ghost-btn small" onClick={() => toggleEnabled(c.id, c.enabled)}>
                  {c.enabled ? 'Disable' : 'Enable'}
                </button>
                <button className="ghost-btn small danger" onClick={() => removeConfig(c.id)}>Remove</button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="health-section">
        <h3 className="health-section-title">Recent Alerts</h3>
        {alerts.length === 0 && <p className="muted">No alerts yet.</p>}
        <div className="health-alert-list">
          {alerts.slice(0, 20).map(a => (
            <div key={a.id} className={`health-alert ${a.severity}`}>
              <span className="health-alert-sev">● {a.severity}</span>
              <span className="health-alert-msg">{a.message}</span>
              <span className="health-alert-ts">{new Date(a.created_at).toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
