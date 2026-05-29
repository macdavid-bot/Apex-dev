import { useState } from 'react';
import './Panel.css';
import './RepositoryExplorer.css';

export default function RepositoryExplorer({ onLoadRepo, onLoadFile, activeRepo, onAskAI }) {
  const [url, setUrl]           = useState('');
  const [repo, setRepo]         = useState(activeRepo || null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [search, setSearch]     = useState('');
  const [openFile, setOpenFile] = useState(null);
  const [fileLoading, setFileLoading] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [commitMsg, setCommitMsg] = useState('');
  const [saving, setSaving]     = useState(false);
  const [saveMsg, setSaveMsg]   = useState('');

  async function handleLoad() {
    if (!url.trim()) return;
    setLoading(true); setError(null); setRepo(null); setOpenFile(null);
    try {
      const res = await fetch('/github/load', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setRepo(data);
      if (onLoadRepo) onLoadRepo(data);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  async function handleOpenFile(path) {
    if (!repo) return;
    setFileLoading(true); setOpenFile(null); setEditMode(false); setSaveMsg('');
    try {
      const res = await fetch('/github/file', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner: repo.owner, repo: repo.repo, path, branch: repo.branch })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setOpenFile(data);
      setEditContent(data.content);
      if (onLoadFile) onLoadFile(data);
    } catch (e) { setError(e.message); }
    finally { setFileLoading(false); }
  }

  async function handleSave() {
    if (!repo || !openFile || !commitMsg.trim()) return;
    setSaving(true); setSaveMsg('');
    try {
      const res = await fetch('/github/edit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner: repo.owner, repo: repo.repo,
          path: openFile.path, content: editContent,
          message: commitMsg, branch: repo.branch,
          sha: openFile.sha
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSaveMsg(`✓ Committed: ${data.commitSha?.slice(0,7)}`);
      setOpenFile(prev => ({ ...prev, sha: data.sha }));
      setEditMode(false); setCommitMsg('');
    } catch (e) { setSaveMsg(`Error: ${e.message}`); }
    finally { setSaving(false); }
  }

  const filteredFiles = repo?.files?.filter(f =>
    !search || f.path.toLowerCase().includes(search.toLowerCase())
  ) || [];

  return (
    <div className="panel repo-explorer">
      <div className="panel-title">
        <h2>Repository Explorer</h2>
        <p>Load a GitHub repo, browse files, and edit them with AI assistance</p>
      </div>

      {/* URL loader */}
      <div className="input-row">
        <input className="field-input" placeholder="https://github.com/owner/repo"
          value={url} onChange={e => setUrl(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleLoad()} />
        <button className="primary-btn" onClick={handleLoad} disabled={loading}>
          {loading ? 'Loading…' : 'Load'}
        </button>
      </div>
      {error && <p className="error-text">{error}</p>}

      {repo && (
        <div className="repo-layout">
          {/* File tree panel */}
          <div className="file-tree">
            <div className="tree-header">
              <span className="tree-title">{repo.owner}/{repo.repo}</span>
              <span className="tree-meta">{repo.language} · {repo.fileCount} files</span>
            </div>
            <input className="field-input tree-search" placeholder="Filter files…"
              value={search} onChange={e => setSearch(e.target.value)} />
            <div className="tree-list">
              {fileLoading && <p className="muted" style={{padding:'8px'}}>Loading…</p>}
              {filteredFiles.map(f => (
                <button key={f.path}
                  className={`tree-file ${openFile?.path === f.path ? 'active' : ''}`}
                  onClick={() => handleOpenFile(f.path)}
                  title={f.path}>
                  <span className="tree-file-icon">{getIcon(f.path)}</span>
                  <span className="tree-file-path">{f.path}</span>
                </button>
              ))}
            </div>
          </div>

          {/* File viewer / editor */}
          <div className="file-view">
            {!openFile && !fileLoading && (
              <div className="file-empty">
                <p>Select a file from the tree to view and edit it.</p>
                {repo.readme && (
                  <div className="readme-block">
                    <p className="readme-label">README</p>
                    <pre className="result-pre">{repo.readme}</pre>
                  </div>
                )}
              </div>
            )}
            {openFile && (
              <>
                <div className="file-toolbar">
                  <span className="file-path-label">{openFile.path}</span>
                  <div className="file-toolbar-actions">
                    {onAskAI && (
                      <button className="ghost-btn" style={{fontSize:12,marginRight:6}}
                        onClick={() => onAskAI(`I've opened ${openFile.path}. Please review it and suggest improvements.`)}>
                        Ask AI
                      </button>
                    )}
                    {!editMode
                      ? <button className="primary-btn" style={{padding:'5px 14px',fontSize:13}} onClick={() => setEditMode(true)}>Edit</button>
                      : <button className="primary-btn" style={{padding:'5px 14px',fontSize:13,background:'#da3633'}} onClick={() => { setEditMode(false); setEditContent(openFile.content); }}>Cancel</button>
                    }
                  </div>
                </div>

                {editMode ? (
                  <div className="editor-area">
                    <textarea className="code-editor" value={editContent}
                      onChange={e => setEditContent(e.target.value)} spellCheck={false} />
                    <div className="commit-row">
                      <input className="field-input" placeholder="Commit message…"
                        value={commitMsg} onChange={e => setCommitMsg(e.target.value)} />
                      <button className="primary-btn" onClick={handleSave}
                        disabled={saving || !commitMsg.trim()}>
                        {saving ? 'Saving…' : 'Commit'}
                      </button>
                    </div>
                    {saveMsg && <p className={saveMsg.startsWith('✓') ? 'save-ok' : 'error-text'}>{saveMsg}</p>}
                  </div>
                ) : (
                  <pre className="code-view">{openFile.content}</pre>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function getIcon(path) {
  if (path.endsWith('.js') || path.endsWith('.jsx')) return '🟨';
  if (path.endsWith('.ts') || path.endsWith('.tsx')) return '🔷';
  if (path.endsWith('.css'))  return '🎨';
  if (path.endsWith('.html')) return '🌐';
  if (path.endsWith('.md'))   return '📝';
  if (path.endsWith('.json')) return '📋';
  if (path.endsWith('.sh'))   return '⚙️';
  if (path.endsWith('.py'))   return '🐍';
  if (path.includes('/'))     return '📄';
  return '📄';
}
