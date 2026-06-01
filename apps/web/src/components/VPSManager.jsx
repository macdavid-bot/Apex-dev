import { useState, useEffect } from 'react';
import { authHeaders } from '../hooks/useAuth';
import './VPSManager.css';

const DEFAULT_FORM = {
  label: '', host: '', port: '22', username: 'root', privateKey: '',
  deployDir: '', deployCommands: 'git pull\nnpm install --production\npm2 restart all',
  serviceName: '', envFile: '.env'
};

export default function VPSManager({ onServersChanged }) {
  const [servers, setServers]         = useState([]);
  const [showAdd, setShowAdd]         = useState(false);
  const [form, setForm]               = useState(DEFAULT_FORM);
  const [testResults, setTestResults] = useState({});
  const [saving, setSaving]           = useState(false);
  const [deployLogs, setDeployLogs]   = useState({});
  const [deploying, setDeploying]     = useState(null);

  // Env-var injection form
  const [envServerId, setEnvServerId] = useState('');
  const [envKey, setEnvKey]           = useState('');
  const [envValue, setEnvValue]       = useState('');
  const [envResult, setEnvResult]     = useState(null);
  const [envSaving, setEnvSaving]     = useState(false);

  async function refresh() {
    const res = await fetch('/vps/servers', { headers: authHeaders() });
    if (res.ok) {
      const data = await res.json();
      setServers(data);
      if (data.length > 0 && !envServerId) setEnvServerId(data[0].id);
    }
  }

  useEffect(() => { refresh(); }, []);

  function setField(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function handleAdd(e) {
    e.preventDefault();
    if (!form.label || !form.host || !form.username || !form.privateKey) return;
    setSaving(true);
    const res = await fetch('/vps/servers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({
        label: form.label, host: form.host, port: Number(form.port) || 22,
        username: form.username, privateKey: form.privateKey,
        deployDir: form.deployDir, deployCommands: form.deployCommands,
        serviceName: form.serviceName, envFile: form.envFile
      })
    });
    setSaving(false);
    if (res.ok) {
      setForm(DEFAULT_FORM);
      setShowAdd(false);
      await refresh();
      onServersChanged?.();
    } else {
      const err = await res.json();
      alert('Error: ' + err.error);
    }
  }

  async function testServer(id) {
    setTestResults(r => ({ ...r, [id]: { loading: true } }));
    const res = await fetch(`/vps/servers/${id}/test`, { method: 'POST', headers: authHeaders() });
    const data = await res.json();
    setTestResults(r => ({ ...r, [id]: data }));
  }

  async function deleteServer(id, label) {
    if (!window.confirm(`Remove server "${label}"?`)) return;
    await fetch(`/vps/servers/${id}`, { method: 'DELETE', headers: authHeaders() });
    await refresh();
    onServersChanged?.();
  }

  async function deployServer(server) {
    if (deploying) return;
    setDeploying(server.id);
    setDeployLogs(l => ({ ...l, [server.id]: [] }));

    const evtSource = new EventSource(
      `/vps/servers/${server.id}/deploy?token=${encodeURIComponent(localStorage.getItem('apex_token') || '')}`
    );

    evtSource.addEventListener('step', e => {
      const { step } = JSON.parse(e.data);
      setDeployLogs(l => ({ ...l, [server.id]: [...(l[server.id] || []), step] }));
    });

    evtSource.addEventListener('done', () => {
      evtSource.close();
      setDeploying(null);
    });

    evtSource.addEventListener('error', e => {
      const data = e.data ? JSON.parse(e.data) : {};
      setDeployLogs(l => ({
        ...l,
        [server.id]: [...(l[server.id] || []), { label: data.error || 'Deploy failed', status: 'error', index: 99 }]
      }));
      evtSource.close();
      setDeploying(null);
    });

    evtSource.onerror = () => {
      evtSource.close();
      setDeploying(null);
    };
  }

  async function handleSetEnv(e) {
    e.preventDefault();
    if (!envServerId || !envKey || !envValue) return;
    setEnvSaving(true);
    setEnvResult(null);
    const res = await fetch(`/vps/servers/${envServerId}/set-env`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ key: envKey, value: envValue })
    });
    const data = await res.json();
    setEnvSaving(false);
    setEnvResult(data);
    if (data.success) { setEnvKey(''); setEnvValue(''); }
  }

  return (
    <div className="vps-manager">

      {/* ── Header ── */}
      <div className="vps-header">
        <div>
          <h2>VPS Servers</h2>
          <p className="muted">Connected servers the AI agent can execute commands on.</p>
        </div>
        <button className="btn-primary" onClick={() => setShowAdd(o => !o)}>
          {showAdd ? 'Cancel' : '+ Add Server'}
        </button>
      </div>

      {/* ── Add form ── */}
      {showAdd && (
        <form className="vps-add-form" onSubmit={handleAdd}>
          <h3>New Server</h3>
          <div className="vps-form-row">
            <div className="vps-form-group">
              <label>Label *</label>
              <input value={form.label} onChange={e => setField('label', e.target.value)} placeholder="Production" required />
            </div>
            <div className="vps-form-group">
              <label>Host / IP *</label>
              <input value={form.host} onChange={e => setField('host', e.target.value)} placeholder="192.168.1.1" required />
            </div>
            <div className="vps-form-group vps-form-group--sm">
              <label>Port</label>
              <input value={form.port} onChange={e => setField('port', e.target.value)} placeholder="22" type="number" />
            </div>
          </div>
          <div className="vps-form-row">
            <div className="vps-form-group">
              <label>Username *</label>
              <input value={form.username} onChange={e => setField('username', e.target.value)} placeholder="root" required />
            </div>
            <div className="vps-form-group">
              <label>Deploy Directory</label>
              <input value={form.deployDir} onChange={e => setField('deployDir', e.target.value)} placeholder="/var/www/myapp" />
            </div>
            <div className="vps-form-group">
              <label>PM2 / Service Name</label>
              <input value={form.serviceName} onChange={e => setField('serviceName', e.target.value)} placeholder="myapp" />
            </div>
          </div>
          <div className="vps-form-group">
            <label>SSH Private Key *</label>
            <textarea
              value={form.privateKey}
              onChange={e => setField('privateKey', e.target.value)}
              placeholder={'-----BEGIN OPENSSH PRIVATE KEY-----\n...\n-----END OPENSSH PRIVATE KEY-----'}
              rows={6}
              required
            />
          </div>
          <div className="vps-form-row">
            <div className="vps-form-group">
              <label>Env File Path</label>
              <input value={form.envFile} onChange={e => setField('envFile', e.target.value)} placeholder=".env" />
            </div>
          </div>
          <div className="vps-form-group">
            <label>Deploy Commands <span className="muted">(one per line)</span></label>
            <textarea
              value={form.deployCommands}
              onChange={e => setField('deployCommands', e.target.value)}
              rows={4}
              placeholder={'git pull\nnpm install --production\npm2 restart all'}
            />
          </div>
          <div className="vps-form-actions">
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Adding…' : 'Add Server'}
            </button>
          </div>
        </form>
      )}

      {/* ── Server list ── */}
      {servers.length === 0 && !showAdd && (
        <div className="vps-empty">
          <span>No VPS servers added yet.</span>
          <span className="muted">Add a server so the AI can run commands and deploy your app.</span>
        </div>
      )}

      <div className="vps-server-list">
        {servers.map(server => {
          const test = testResults[server.id];
          const logs = deployLogs[server.id];
          return (
            <div key={server.id} className="vps-server-card">
              <div className="vps-server-top">
                <div className="vps-server-info">
                  <span className="vps-server-label">{server.label}</span>
                  <span className="vps-server-host">{server.username}@{server.host}:{server.port || 22}</span>
                  {server.deploy_dir && <span className="vps-server-meta">📁 {server.deploy_dir}</span>}
                  {server.service_name && <span className="vps-server-meta">⚡ {server.service_name}</span>}
                </div>
                <div className="vps-server-actions">
                  <button
                    className={`btn-sm ${test?.success === true ? 'btn-sm-ok' : test?.success === false ? 'btn-sm-err' : ''}`}
                    onClick={() => testServer(server.id)}
                    disabled={test?.loading}
                    title="Test SSH connection"
                  >
                    {test?.loading ? '…' : test?.success === true ? '✓ Connected' : test?.success === false ? '✗ Failed' : 'Test'}
                  </button>
                  <button
                    className="btn-sm btn-sm-deploy"
                    onClick={() => deployServer(server)}
                    disabled={deploying === server.id}
                    title="Deploy: run configured deploy commands"
                  >
                    {deploying === server.id ? '⟳ Deploying…' : '🚀 Deploy'}
                  </button>
                  <button
                    className="btn-sm btn-sm-del"
                    onClick={() => deleteServer(server.id, server.label)}
                    title="Remove server"
                  >✕</button>
                </div>
              </div>

              {test?.info && <div className="vps-test-info">{test.info}</div>}
              {test?.error && <div className="vps-test-error">{test.error}</div>}

              {logs && logs.length > 0 && (
                <div className="vps-deploy-log">
                  {logs.map((step, si) => (
                    <div key={si} className={`deploy-step deploy-step-${step.status}`}>
                      <span className="deploy-step-icon">
                        {step.status === 'running' ? <span className="spin-icon">⟳</span> : step.status === 'error' ? '✗' : '✓'}
                      </span>
                      <span>{step.label}</span>
                      {step.detail && <pre className="deploy-step-detail">{step.detail}</pre>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Env var injection ── */}
      {servers.length > 0 && (
        <div className="vps-env-section">
          <h3>🔐 Inject API Key / Secret</h3>
          <p className="muted">Securely write an environment variable to a VPS server's .env file. The value is transmitted over SSH and never stored in this app's database.</p>
          <form className="vps-env-form" onSubmit={handleSetEnv}>
            <div className="vps-form-row">
              <div className="vps-form-group">
                <label>Server</label>
                <select value={envServerId} onChange={e => setEnvServerId(e.target.value)}>
                  {servers.map(s => (
                    <option key={s.id} value={s.id}>{s.label} ({s.host})</option>
                  ))}
                </select>
              </div>
              <div className="vps-form-group">
                <label>Key</label>
                <input
                  value={envKey}
                  onChange={e => setEnvKey(e.target.value)}
                  placeholder="OPENAI_API_KEY"
                  style={{ fontFamily: 'monospace' }}
                  required
                />
              </div>
            </div>
            <div className="vps-form-group">
              <label>Value <span className="muted">(sent directly to server via SSH)</span></label>
              <input
                type="password"
                value={envValue}
                onChange={e => setEnvValue(e.target.value)}
                placeholder="sk-..."
                autoComplete="new-password"
                required
              />
            </div>
            <div className="vps-form-actions">
              <button type="submit" className="btn-primary" disabled={envSaving}>
                {envSaving ? 'Writing to VPS…' : 'Write to .env on VPS'}
              </button>
            </div>
            {envResult && (
              <div className={`vps-env-result ${envResult.success ? 'ok' : 'err'}`}>
                {envResult.success
                  ? `✓ ${envKey} written to ${envResult.env_file}`
                  : `✗ ${envResult.error}`}
              </div>
            )}
          </form>
        </div>
      )}
    </div>
  );
}
