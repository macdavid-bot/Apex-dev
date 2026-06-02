import { useState, useEffect, useCallback } from 'react';
import { authHeaders } from '../hooks/useAuth';
import './Panel.css';
import './DomainManager.css';

export default function DomainManager() {
  const [domains,   setDomains]   = useState([]);
  const [servers,   setServers]   = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [form,      setForm]      = useState({ domain: '', app_port: '3000', server_id: '', ssl: false, notes: '', deploy: true });
  const [msg,       setMsg]       = useState(null);
  const [deploying, setDeploying] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [dr, sr] = await Promise.all([
        fetch('/domains',      { headers: authHeaders() }).then(r => r.ok ? r.json() : []),
        fetch('/vps/servers',  { headers: authHeaders() }).then(r => r.ok ? r.json() : [])
      ]);
      setDomains(Array.isArray(dr) ? dr : []);
      const sl = Array.isArray(sr) ? sr : [];
      setServers(sl);
      if (sl.length && !form.server_id) setForm(f => ({ ...f, server_id: sl[0].id }));
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleAdd(e) {
    e.preventDefault();
    if (!form.domain) return setMsg({ type: 'error', text: 'Domain is required' });
    setDeploying('add');
    setMsg(null);
    try {
      const r = await fetch('/domains', {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, app_port: parseInt(form.app_port) || 3000 })
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Failed');
      setMsg({ type: 'ok', text: `Domain ${data.domain} added${data.deployed ? ' and deployed' : ''}` });
      setForm(f => ({ ...f, domain: '', notes: '' }));
      load();
    } catch (e) { setMsg({ type: 'error', text: e.message }); }
    finally { setDeploying(null); }
  }

  async function deployDomain(id) {
    setDeploying(id);
    setMsg(null);
    try {
      const r = await fetch(`/domains/${id}/deploy`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Deploy failed');
      setMsg({ type: 'ok', text: `${data.domain} deployed successfully` });
      load();
    } catch (e) { setMsg({ type: 'error', text: e.message }); }
    finally { setDeploying(null); }
  }

  async function removeDomain(id, domain) {
    if (!confirm(`Remove domain ${domain}?`)) return;
    setDeploying(id + '-del');
    try {
      await fetch(`/domains/${id}?undeploy=true`, { method: 'DELETE', headers: authHeaders() });
      setMsg({ type: 'ok', text: `${domain} removed` });
      load();
    } catch (e) { setMsg({ type: 'error', text: e.message }); }
    finally { setDeploying(null); }
  }

  const statusColor = s => s === 'active' ? '#3fb950' : s === 'error' ? '#f85149' : '#d29922';

  return (
    <div className="panel domain-panel">
      <div className="panel-title"><h2>🌐 Domains</h2></div>

      {msg && (
        <div className={`domain-msg ${msg.type}`}>{msg.text}</div>
      )}

      <form className="domain-form" onSubmit={handleAdd}>
        <div className="domain-form-row">
          <div className="field-group" style={{ flex: 2 }}>
            <label className="field-label">Domain</label>
            <input className="field-input" placeholder="app.example.com"
              value={form.domain} onChange={e => setForm(f => ({ ...f, domain: e.target.value }))} />
          </div>
          <div className="field-group" style={{ flex: 1 }}>
            <label className="field-label">App Port</label>
            <input className="field-input" type="number" placeholder="3000"
              value={form.app_port} onChange={e => setForm(f => ({ ...f, app_port: e.target.value }))} />
          </div>
          <div className="field-group" style={{ flex: 2 }}>
            <label className="field-label">VPS Server</label>
            <select className="field-input" value={form.server_id}
              onChange={e => setForm(f => ({ ...f, server_id: e.target.value }))}>
              <option value="">— none —</option>
              {servers.map(s => <option key={s.id} value={s.id}>{s.label} ({s.host})</option>)}
            </select>
          </div>
        </div>
        <div className="domain-form-row">
          <div className="field-group" style={{ flex: 3 }}>
            <label className="field-label">Notes</label>
            <input className="field-input" placeholder="e.g. Production API server"
              value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
          <div className="field-group" style={{ flex: 1 }}>
            <label className="field-label" style={{ marginBottom: 6 }}>SSL (certbot)</label>
            <label className="toggle-label">
              <input type="checkbox" checked={form.ssl}
                onChange={e => setForm(f => ({ ...f, ssl: e.target.checked }))} />
              <span className="toggle-text">{form.ssl ? 'Yes' : 'No'}</span>
            </label>
          </div>
          <div className="field-group" style={{ flex: 1 }}>
            <label className="field-label" style={{ marginBottom: 6 }}>Auto-deploy nginx</label>
            <label className="toggle-label">
              <input type="checkbox" checked={form.deploy}
                onChange={e => setForm(f => ({ ...f, deploy: e.target.checked }))} />
              <span className="toggle-text">{form.deploy ? 'Yes' : 'No'}</span>
            </label>
          </div>
          <div className="field-group" style={{ flex: 1, justifyContent: 'flex-end', display: 'flex', alignItems: 'flex-end' }}>
            <button className="action-btn primary" type="submit" disabled={!!deploying}>
              {deploying === 'add' ? 'Adding…' : '+ Add Domain'}
            </button>
          </div>
        </div>
      </form>

      <div className="domain-list">
        {loading && <p className="muted">Loading…</p>}
        {!loading && domains.length === 0 && (
          <div className="domain-empty">
            <p className="muted">No domains configured yet.</p>
            <p className="muted" style={{ fontSize: 12 }}>Add a domain above and Apex Dev will generate and deploy the nginx reverse-proxy config automatically.</p>
          </div>
        )}
        {domains.map(d => (
          <div key={d.id} className="domain-card">
            <div className="domain-card-main">
              <span className="domain-name">🌐 {d.domain}</span>
              <span className="domain-badge" style={{ color: statusColor(d.status) }}>● {d.status}</span>
              {d.ssl && <span className="domain-badge ssl">🔒 SSL</span>}
            </div>
            <div className="domain-card-meta">
              <span>port {d.app_port}</span>
              {d.server_id && <span>VPS: {servers.find(s => s.id === d.server_id)?.label || d.server_id}</span>}
              {d.notes && <span>{d.notes}</span>}
              {d.nginx_path && <span className="mono">{d.nginx_path}</span>}
            </div>
            <div className="domain-card-actions">
              <button className="ghost-btn small" disabled={!!deploying}
                onClick={() => deployDomain(d.id)}>
                {deploying === d.id ? '…' : 'Deploy nginx'}
              </button>
              <button className="ghost-btn small danger" disabled={!!deploying}
                onClick={() => removeDomain(d.id, d.domain)}>
                {deploying === d.id + '-del' ? '…' : 'Remove'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
