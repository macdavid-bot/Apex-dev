import { useState, useEffect } from 'react';
import './Panel.css';

export default function SSHKeyManager({ onSessionReady }) {
  const [sessions, setSessions] = useState([]);
  const [form, setForm]         = useState({ label: '', host: '', username: 'root', port: '22', privateKey: '' });
  const [saving, setSaving]     = useState(false);
  const [testing, setTesting]   = useState(null);
  const [testResult, setTestResult] = useState({});
  const [error, setError]       = useState('');

  useEffect(() => {
    fetch('/vps/sessions').then(r => r.json()).then(setSessions).catch(() => {});
  }, []);

  function setField(k, v) { setForm(p => ({ ...p, [k]: v })); }

  async function handleSave() {
    const { label, host, username, privateKey, port } = form;
    if (!label || !host || !username || !privateKey) {
      setError('All fields except port are required.'); return;
    }
    setSaving(true); setError('');
    try {
      const res = await fetch('/vps/session', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label, host, username, privateKey, port: Number(port) || 22 })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSessions(p => [...p, data]);
      setForm({ label: '', host: '', username: 'root', port: '22', privateKey: '' });
      if (onSessionReady) onSessionReady(data);
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  }

  async function handleTest(id) {
    setTesting(id);
    try {
      const res = await fetch('/vps/test', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: id })
      });
      const data = await res.json();
      setTestResult(p => ({ ...p, [id]: data.success ? `✓ ${data.info}` : `✗ ${data.error}` }));
    } catch (e) { setTestResult(p => ({ ...p, [id]: `✗ ${e.message}` })); }
    finally { setTesting(null); }
  }

  async function handleDelete(id) {
    await fetch(`/vps/session/${id}`, { method: 'DELETE' });
    setSessions(p => p.filter(s => s.id !== id));
  }

  return (
    <div className="panel">
      <div className="panel-title">
        <h2>SSH / VPS Sessions</h2>
        <p>Add server connections for terminal automation</p>
      </div>

      {/* Saved sessions */}
      {sessions.length > 0 && (
        <div className="card-list" style={{ marginBottom: 24 }}>
          {sessions.map(s => (
            <div key={s.id} className="info-card">
              <div className="info-card-header">
                <span className="info-card-title">🖥️ {s.label}</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="ghost-btn" onClick={() => handleTest(s.id)} disabled={testing === s.id}>
                    {testing === s.id ? '…' : 'Test'}
                  </button>
                  <button className="ghost-btn danger" onClick={() => handleDelete(s.id)}>Remove</button>
                </div>
              </div>
              <div className="info-row"><span>Host</span><span>{s.username}@{s.host}:{s.port}</span></div>
              {testResult[s.id] && (
                <div style={{ fontSize: 12, marginTop: 6, color: testResult[s.id].startsWith('✓') ? '#3fb950' : '#f85149' }}>
                  {testResult[s.id]}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add session form */}
      <div className="form-block">
        <p style={{ fontSize: 13, fontWeight: 700, color: '#e6edf3', marginBottom: 14 }}>Add New Server</p>
        {error && <p className="error-text" style={{ marginBottom: 10 }}>{error}</p>}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 12px', marginBottom: 10 }}>
          {[
            { k: 'label', placeholder: 'Name  (e.g. production)' },
            { k: 'host',  placeholder: 'IP or hostname' },
            { k: 'username', placeholder: 'SSH user (default: root)' },
            { k: 'port', placeholder: 'Port (default: 22)' },
          ].map(({ k, placeholder }) => (
            <input key={k} className="field-input" placeholder={placeholder}
              value={form[k]} onChange={e => setField(k, e.target.value)} />
          ))}
        </div>

        <label className="field-label">SSH Private Key</label>
        <textarea className="field-textarea" placeholder="-----BEGIN OPENSSH PRIVATE KEY-----&#10;...&#10;-----END OPENSSH PRIVATE KEY-----"
          value={form.privateKey} onChange={e => setField('privateKey', e.target.value)} rows={7} />

        <button className="primary-btn" style={{ marginTop: 12 }} onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save Server'}
        </button>
      </div>
    </div>
  );
}
