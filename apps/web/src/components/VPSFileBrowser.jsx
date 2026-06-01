import { useState, useEffect } from 'react';
import { authHeaders } from '../hooks/useAuth';
import './Panel.css';
import './VPSFileBrowser.css';

const FILE_ICONS = {
  dir:  '📁',
  link: '🔗',
  file: '📄',
  js:   '📜', jsx: '📜', ts: '📜', tsx: '📜',
  py:   '🐍', go: '🔵', rs: '🦀',
  json: '📋', yaml: '📋', yml: '📋', toml: '📋',
  md:   '📝', txt: '📝',
  sh:   '⚙️',
  env:  '🔒', log: '📒'
};

function fileIcon(entry) {
  if (entry.type === 'dir') return FILE_ICONS.dir;
  if (entry.type === 'link') return FILE_ICONS.link;
  const ext = entry.name.split('.').pop().toLowerCase();
  return FILE_ICONS[ext] || FILE_ICONS.file;
}

function fmtSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)}K`;
  return `${(bytes / 1048576).toFixed(1)}M`;
}

export default function VPSFileBrowser() {
  const [servers, setServers]         = useState([]);
  const [serverId, setServerId]       = useState('');
  const [path, setPath]               = useState('~');
  const [entries, setEntries]         = useState([]);
  const [resolvedPath, setResolvedPath] = useState('~');
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState('');

  // File viewer / editor
  const [openFile, setOpenFile]       = useState(null);  // { path, content }
  const [editMode, setEditMode]       = useState(false);
  const [editContent, setEditContent] = useState('');
  const [saving, setSaving]           = useState(false);
  const [saveMsg, setSaveMsg]         = useState('');

  async function fetchServers() {
    try {
      const res = await fetch('/vps/servers', { headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        setServers(data);
        if (data.length > 0 && !serverId) setServerId(data[0].id);
      }
    } catch {}
  }

  useEffect(() => { fetchServers(); }, []);
  useEffect(() => {
    if (serverId) browse(path);
  }, [serverId]);

  async function browse(dir) {
    if (!serverId) return;
    setLoading(true); setError(''); setOpenFile(null);
    try {
      const res = await fetch(
        `/vps/servers/${serverId}/fs/browse?path=${encodeURIComponent(dir)}`,
        { headers: authHeaders() }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setEntries(data.entries || []);
      setResolvedPath(data.path || dir);
      setPath(data.path || dir);
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  }

  function navigateUp() {
    const parts = resolvedPath.replace(/\/$/, '').split('/');
    if (parts.length <= 1) return;
    browse(parts.slice(0, -1).join('/') || '/');
  }

  async function openEntry(entry) {
    if (entry.type === 'dir') {
      browse(resolvedPath.replace(/\/$/, '') + '/' + entry.name);
      return;
    }
    setLoading(true); setError(''); setOpenFile(null); setSaveMsg('');
    try {
      const fp = resolvedPath.replace(/\/$/, '') + '/' + entry.name;
      const res = await fetch(
        `/vps/servers/${serverId}/fs/read?path=${encodeURIComponent(fp)}`,
        { headers: authHeaders() }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setOpenFile({ path: fp, content: data.content, size: data.size });
      setEditContent(data.content);
      setEditMode(false);
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  }

  async function handleSave() {
    if (!openFile) return;
    setSaving(true); setSaveMsg('');
    try {
      const res = await fetch(`/vps/servers/${serverId}/fs/write`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ path: openFile.path, content: editContent })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setOpenFile(f => ({ ...f, content: editContent }));
      setEditMode(false);
      setSaveMsg('Saved successfully');
    } catch (err) {
      setSaveMsg('Error: ' + err.message);
    }
    setSaving(false);
  }

  async function handleDelete(entry) {
    const fp = resolvedPath.replace(/\/$/, '') + '/' + entry.name;
    if (!window.confirm(`Delete "${fp}"?`)) return;
    const res = await fetch(`/vps/servers/${serverId}/fs/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ path: fp, recursive: entry.type === 'dir' })
    });
    if (res.ok) browse(resolvedPath);
    else { const d = await res.json(); setError(d.error); }
  }

  const breadcrumbs = resolvedPath.split('/').filter(Boolean);

  return (
    <div className="panel">
      <div className="panel-title">
        <h2>VPS File Browser</h2>
        <p>Browse, view, and edit files on your VPS servers over SSH.</p>
      </div>

      {/* Server selector + path bar */}
      <div className="fb-controls">
        <select className="field-input fb-server-select" value={serverId}
          onChange={e => { setServerId(e.target.value); setPath('~'); setEntries([]); }}>
          {servers.map(s => <option key={s.id} value={s.id}>{s.label} ({s.host})</option>)}
        </select>
        <div className="fb-breadcrumb">
          <button className="ghost-btn fb-home" onClick={() => browse('~')}>~</button>
          {breadcrumbs.map((seg, i) => (
            <span key={i}>
              <span className="fb-sep">/</span>
              <button className="ghost-btn fb-seg"
                onClick={() => browse('/' + breadcrumbs.slice(0, i + 1).join('/'))}>
                {seg}
              </button>
            </span>
          ))}
        </div>
        <button className="ghost-btn" onClick={() => browse(resolvedPath)} disabled={loading}>↻</button>
      </div>

      {error && <p className="error-text">{error}</p>}

      <div className="fb-layout">
        {/* Directory listing */}
        <div className="fb-listing">
          {resolvedPath !== '/' && resolvedPath !== '~' && (
            <div className="fb-entry fb-entry-up" onClick={navigateUp}>
              <span>📂</span>
              <span>..</span>
            </div>
          )}
          {loading && entries.length === 0 && (
            <div className="fb-loading">Loading…</div>
          )}
          {entries.map(e => (
            <div key={e.name} className={`fb-entry ${e.type === 'dir' ? 'fb-dir' : 'fb-file'}`}>
              <div className="fb-entry-main" onClick={() => openEntry(e)}>
                <span className="fb-icon">{fileIcon(e)}</span>
                <span className="fb-name">{e.name}</span>
                <span className="fb-size">{fmtSize(e.size)}</span>
                <span className="fb-date">{e.modified}</span>
              </div>
              <button className="ghost-btn danger fb-del" onClick={() => handleDelete(e)}>✕</button>
            </div>
          ))}
        </div>

        {/* File viewer / editor */}
        {openFile && (
          <div className="fb-viewer">
            <div className="fb-viewer-header">
              <span className="fb-viewer-path">{openFile.path}</span>
              <div style={{ display: 'flex', gap: 8 }}>
                {!editMode && (
                  <button className="ghost-btn" onClick={() => setEditMode(true)}>Edit</button>
                )}
                {editMode && (
                  <>
                    <button className="primary-btn fb-save-btn" onClick={handleSave} disabled={saving}>
                      {saving ? 'Saving…' : 'Save'}
                    </button>
                    <button className="ghost-btn" onClick={() => { setEditMode(false); setEditContent(openFile.content); }}>
                      Cancel
                    </button>
                  </>
                )}
                <button className="ghost-btn" onClick={() => setOpenFile(null)}>✕</button>
              </div>
            </div>
            {saveMsg && (
              <div className={`fb-save-msg ${saveMsg.startsWith('Error') ? 'err' : 'ok'}`}>{saveMsg}</div>
            )}
            {editMode ? (
              <textarea className="fb-editor" value={editContent}
                onChange={e => setEditContent(e.target.value)} spellCheck={false} />
            ) : (
              <pre className="fb-content">{openFile.content}</pre>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
