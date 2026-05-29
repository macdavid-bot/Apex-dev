import { useState } from 'react';
import './Panel.css';

export default function SSHKeyManager({ keys = [], onSave }) {
  const [name, setName] = useState('');
  const [key, setKey]   = useState('');
  const [saved, setSaved] = useState(false);

  function handleSave() {
    if (!name.trim() || !key.trim()) return alert('Both name and key are required.');
    onSave({ name: name.trim(), key: key.trim() });
    setName('');
    setKey('');
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="panel">
      <div className="panel-title">
        <h2>SSH Key Manager</h2>
        <p>Store SSH keys for VPS operations</p>
      </div>

      {keys.length > 0 && (
        <div className="card-list" style={{ marginBottom: 24 }}>
          {keys.map((k, i) => (
            <div key={i} className="info-card">
              <div className="info-card-header">
                <span className="info-card-title">🔑 {k.name}</span>
                <span className="info-badge" style={{ color: '#3fb950' }}>● saved</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="form-block">
        <label className="field-label">Key Name</label>
        <input
          className="field-input"
          placeholder="e.g. production-vps"
          value={name}
          onChange={e => setName(e.target.value)}
        />

        <label className="field-label" style={{ marginTop: 14 }}>Private Key</label>
        <textarea
          className="field-textarea"
          placeholder="Paste your SSH private key here (-----BEGIN ...)"
          value={key}
          onChange={e => setKey(e.target.value)}
          rows={8}
        />

        <button className="primary-btn" style={{ marginTop: 14 }} onClick={handleSave}>
          {saved ? '✓ Saved' : 'Save Key'}
        </button>
      </div>
    </div>
  );
}
