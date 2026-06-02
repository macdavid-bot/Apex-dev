import { useState, useRef } from 'react';
import { authHeaders, getToken } from '../hooks/useAuth';
import './Panel.css';
import './DatabaseAdmin.css';

export default function DatabaseAdmin() {
  const [tab,        setTab]        = useState('import');
  const [file,       setFile]       = useState(null);
  const [target,     setTarget]     = useState('local');
  const [serverId,   setServerId]   = useState('');
  const [dbUrl,      setDbUrl]      = useState('');
  const [servers,    setServers]    = useState([]);
  const [log,        setLog]        = useState([]);
  const [busy,       setBusy]       = useState(false);
  const [exporting,  setExporting]  = useState(false);
  const fileRef = useRef();

  useState(() => {
    fetch('/vps/servers', { headers: authHeaders() })
      .then(r => r.ok ? r.json() : [])
      .then(d => { const list = Array.isArray(d) ? d : []; setServers(list); if (list.length) setServerId(list[0].id); })
      .catch(() => {});
  });

  function pushLog(type, text) {
    setLog(l => [...l, { type, text, ts: new Date().toLocaleTimeString() }]);
  }

  async function handleImport(e) {
    e.preventDefault();
    if (!file) return pushLog('error', 'Please select a backup file');
    setBusy(true);
    setLog([]);

    const fd = new FormData();
    fd.append('backup', file);
    if (target === 'vps') {
      fd.append('server_id', serverId);
      if (dbUrl) fd.append('database_url', dbUrl);
    }

    const endpoint = target === 'vps' ? '/db-admin/import-to-vps' : '/db-admin/import';

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
        body: fd
      });

      if (!res.ok) {
        const err = await res.json();
        pushLog('error', err.error || 'Upload failed');
        setBusy(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop();
        for (const line of lines) {
          if (line.startsWith('data:')) {
            try {
              const ev = JSON.parse(line.slice(5).trim());
              if (ev.message) pushLog(ev.output ? 'detail' : 'info', ev.message);
              if (ev.output)  pushLog('detail', ev.output);
            } catch {}
          } else if (line.startsWith('event:')) {
            const evType = line.slice(6).trim();
            if (evType === 'done')  pushLog('success', '✓ Restore complete');
            if (evType === 'error') pushLog('error', '✗ Restore failed — see output above');
          }
        }
      }
    } catch (err) { pushLog('error', err.message); }
    setBusy(false);
  }

  async function handleExport() {
    setExporting(true);
    try {
      const r = await fetch('/db-admin/export', { headers: authHeaders() });
      if (!r.ok) { const e = await r.json(); return pushLog('error', e.error || 'Export failed'); }
      const blob = await r.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url;
      a.download = `apex-dev-backup-${new Date().toISOString().slice(0,10)}.sql`;
      a.click();
      URL.revokeObjectURL(url);
      pushLog('success', '✓ Backup downloaded');
    } catch (e) { pushLog('error', e.message); }
    finally { setExporting(false); }
  }

  return (
    <div className="panel db-admin-panel">
      <div className="panel-title"><h2>🗃️ Database Admin</h2></div>

      <div className="db-tabs">
        <button className={`db-tab ${tab === 'import' ? 'active' : ''}`} onClick={() => setTab('import')}>Import Backup</button>
        <button className={`db-tab ${tab === 'export' ? 'active' : ''}`} onClick={() => setTab('export')}>Export Backup</button>
      </div>

      {tab === 'import' && (
        <form className="db-form" onSubmit={handleImport}>
          <div className="field-group">
            <label className="field-label">Backup File (.sql or .dump)</label>
            <div className="db-file-drop" onClick={() => fileRef.current.click()}>
              {file
                ? <span className="db-file-name">📄 {file.name} ({(file.size / 1024).toFixed(1)} KB)</span>
                : <span className="db-file-hint">Click to select .sql or .dump file</span>
              }
              <input ref={fileRef} type="file" accept=".sql,.dump,.gz" style={{ display: 'none' }}
                onChange={e => setFile(e.target.files[0] || null)} />
            </div>
          </div>

          <div className="field-group">
            <label className="field-label">Restore Target</label>
            <div className="db-target-tabs">
              <button type="button" className={`db-tab ${target === 'local' ? 'active' : ''}`}
                onClick={() => setTarget('local')}>Local DB (this server)</button>
              <button type="button" className={`db-tab ${target === 'vps' ? 'active' : ''}`}
                onClick={() => setTarget('vps')}>VPS Server</button>
            </div>
          </div>

          {target === 'vps' && (
            <>
              <div className="field-group">
                <label className="field-label">VPS Server</label>
                <select className="field-input" value={serverId} onChange={e => setServerId(e.target.value)}>
                  <option value="">Select server…</option>
                  {servers.map(s => <option key={s.id} value={s.id}>{s.label} ({s.host})</option>)}
                </select>
              </div>
              <div className="field-group">
                <label className="field-label">Database URL on VPS</label>
                <input className="field-input" placeholder="postgresql://user:pass@localhost/dbname"
                  value={dbUrl} onChange={e => setDbUrl(e.target.value)} />
              </div>
            </>
          )}

          <button className="action-btn primary" type="submit" disabled={busy}>
            {busy ? 'Restoring…' : 'Start Restore'}
          </button>
        </form>
      )}

      {tab === 'export' && (
        <div className="db-export">
          <p className="muted">Export the current local database as a SQL dump file for backup or migration.</p>
          <button className="action-btn primary" onClick={handleExport} disabled={exporting}>
            {exporting ? 'Exporting…' : '⬇ Download SQL Dump'}
          </button>
        </div>
      )}

      {log.length > 0 && (
        <div className="db-log">
          {log.map((l, i) => (
            <div key={i} className={`db-log-line ${l.type}`}>
              <span className="db-log-ts">{l.ts}</span>
              <span className="db-log-text">{l.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
