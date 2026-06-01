import { useState, useEffect } from 'react';
import { authHeaders } from '../hooks/useAuth';
import './Panel.css';

export default function SSHKeyManager({ onSessionReady }) {
  const [sessions,    setSessions]    = useState([]);
  const [form,        setForm]        = useState({ label: '', host: '', username: 'root', port: '22', privateKey: '' });
  const [saving,      setSaving]      = useState(false);
  const [testing,     setTesting]     = useState(null);
  const [testResult,  setTestResult]  = useState({});
  const [error,       setError]       = useState('');

  useEffect(() => {
    fetch('/vps/servers', { headers: authHeaders() })
      .then(r => r.ok ? r.json() : [])
      .then(data => setSessions(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  function setField(k, v) { setForm(p => ({ ...p, [k]: v })); }

  async function handleSave() {
    const { label, host, username, privateKey, port } = form;
    if (!label || !host || !username || !privateKey) {
      setError('Label, host, username, and SSH private key are required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/vps/servers', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body:    JSON.stringify({ label, host, username, privateKey, port: Number(port) || 22 })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSessions(p => [...p, data]);
      setForm({ label: '', host: '', username: 'root', port: '22', privateKey: '' });
      if (onSessionReady) onSessionReady(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleTest(id) {
    setTesting(id);
    try {
      const res = await fetch(`/vps/servers/${id}/test`, {
        method:  'POST',
        headers: authHeaders()
      });
      const data = await res.json();
      setTestResult(p => ({ ...p, [id]: data.success ? `✓ ${data.info}` : `✗ ${data.error}` }));
    } catch (e) {
      setTestResult(p => ({ ...p, [id]: `✗ ${e.message}` }));
    } finally {
      setTesting(null);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Remove this server?')) return;
    await fetch(`/vps/servers/${id}`, { method: 'DELETE', headers: authHeaders() });
    setSessions(p => p.filter(s => s.id !== id));
  }

  return (
    <div className="panel">
      <div className="panel-title">
        <h2>SSH Keys / VPS Sessions</h2>
        <p>Add server connections for terminal access and automated deployments</p>
      </div>

      {sessions.length > 0 && (
        <div className="card-list" style={{ marginBottom: 24 }}>
          {sessions.map(s => (
            <div key={s.id} className="info-card">
              <div className="info-card-header">
                <span className="info-card-title">🖥️ {s.label}</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    className="ghost-btn"
                    onClick={() => handleTest(s.id)}
                    disabled={testing === s.id}
                  >
                    {testing === s.id ? '…' : 'Test'}
                  </button>
                  <button className="ghost-btn danger" onClick={() => handleDelete(s.id)}>Remove</button>
                </div>
              </div>
              <div className="info-row">
                <span>Host</span>
                <span>{s.username}@{s.host}:{s.port || 22}</span>
              </div>
              {testResult[s.id] && (
                <div style={{
                  fontSize: 12, marginTop: 6,
                  color: testResult[s.id].startsWith('✓') ? '#3fb950' : '#f85149'
                }}>
                  {testResult[s.id]}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="form-block">
        <p style={{ fontSize: 13, fontWeight: 700, color: '#e6edf3', marginBottom: 14 }}>Add New Server</p>
        {error && <p className="error-text" style={{ marginBottom: 10 }}>{error}</p>}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 12px', marginBottom: 10 }}>
          {[
            { k: 'label',    placeholder: 'Label (e.g. production)' },
            { k: 'host',     placeholder: 'IP or hostname' },
            { k: 'username', placeholder: 'SSH user (default: root)' },
            { k: 'port',     placeholder: 'Port (default: 22)' },
          ].map(({ k, placeholder }) => (
            <input
              key={k}
              className="field-input"
              placeholder={placeholder}
              value={form[k]}
              onChange={e => setField(k, e.target.value)}
            />
          ))}
        </div>

        <label className="field-label">SSH Private Key</label>
        <textarea
          className="field-textarea"
          placeholder={'-----BEGIN OPENSSH PRIVATE KEY-----\n...\n-----END OPENSSH PRIVATE KEY-----'}
          value={form.privateKey}
          onChange={e => setField('privateKey', e.target.value)}
          rows={7}
        />

        <button
          className="primary-btn"
          style={{ marginTop: 12 }}
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? 'Saving…' : 'Save Server'}
        </button>
      </div>
    </div>
  );
}
