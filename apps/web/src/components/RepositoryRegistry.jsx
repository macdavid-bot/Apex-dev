import { useState, useEffect } from 'react';
import { authHeaders } from '../hooks/useAuth';
import './Panel.css';
import './RepositoryRegistry.css';

const EMPTY_FORM = {
  name: '', label: '', githubUrl: '', owner: '', repo: '',
  branch: 'main', purpose: '', clonePath: '', deployServerId: '', envInfo: ''
};

export default function RepositoryRegistry({ onSelectRepo, activeRepoName }) {
  const [repos, setRepos]         = useState([]);
  const [loading, setLoading]     = useState(false);
  const [showForm, setShowForm]   = useState(false);
  const [form, setForm]           = useState(EMPTY_FORM);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState('');
  const [servers, setServers]     = useState([]);

  async function fetchRepos() {
    setLoading(true);
    try {
      const res = await fetch('/repos', { headers: authHeaders() });
      if (res.ok) setRepos(await res.json());
    } catch {}
    setLoading(false);
  }

  async function fetchServers() {
    try {
      const res = await fetch('/vps/servers', { headers: authHeaders() });
      if (res.ok) setServers(await res.json());
    } catch {}
  }

  useEffect(() => { fetchRepos(); fetchServers(); }, []);

  function setField(k, v) { setForm(f => ({ ...f, [k]: v })); }

  // Auto-parse GitHub URL to extract owner/repo
  function handleUrlChange(url) {
    setField('githubUrl', url);
    const m = url.match(/github\.com\/([^/]+)\/([^/?.#]+)/);
    if (m) {
      if (!form.owner) setForm(f => ({ ...f, githubUrl: url, owner: m[1], repo: m[2] }));
      else setForm(f => ({ ...f, githubUrl: url }));
    }
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!form.name || !form.label) return;
    setSaving(true); setError('');
    try {
      const res = await fetch('/repos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(form)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setForm(EMPTY_FORM);
      setShowForm(false);
      await fetchRepos();
    } catch (err) {
      setError(err.message);
    }
    setSaving(false);
  }

  async function handleDelete(name, label) {
    if (!window.confirm(`Remove "${label}" from registry?`)) return;
    await fetch(`/repos/${name}`, { method: 'DELETE', headers: authHeaders() });
    await fetchRepos();
  }

  function handleSelect(repo) {
    if (!repo.owner || !repo.repo) return;
    const ctx = {
      owner: repo.owner, repo: repo.repo, branch: repo.branch || 'main',
      name: repo.name, label: repo.label
    };
    onSelectRepo?.(ctx);
  }

  return (
    <div className="panel">
      <div className="panel-title">
        <h2>Repository Registry</h2>
        <p>Named repositories the AI resolves by name — "Work on Manuskripta" → owner/repo.</p>
      </div>

      <div className="reg-toolbar">
        <button className="primary-btn" onClick={() => setShowForm(v => !v)}>
          {showForm ? 'Cancel' : '+ Register Repo'}
        </button>
        <button className="ghost-btn" onClick={fetchRepos} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {showForm && (
        <form className="reg-form" onSubmit={handleSave}>
          <div className="reg-form-row">
            <div>
              <label className="field-label">Slug name *</label>
              <input className="field-input" placeholder="manuskripta" value={form.name}
                onChange={e => setField('name', e.target.value)} required />
              <span className="reg-hint">Lowercase slug used by AI to identify this repo</span>
            </div>
            <div>
              <label className="field-label">Display label *</label>
              <input className="field-input" placeholder="Manuskripta" value={form.label}
                onChange={e => setField('label', e.target.value)} required />
            </div>
          </div>

          <div>
            <label className="field-label">GitHub URL</label>
            <input className="field-input full" placeholder="https://github.com/owner/repo"
              value={form.githubUrl} onChange={e => handleUrlChange(e.target.value)} />
          </div>

          <div className="reg-form-row">
            <div>
              <label className="field-label">Owner</label>
              <input className="field-input" placeholder="octocat" value={form.owner}
                onChange={e => setField('owner', e.target.value)} />
            </div>
            <div>
              <label className="field-label">Repo</label>
              <input className="field-input" placeholder="hello-world" value={form.repo}
                onChange={e => setField('repo', e.target.value)} />
            </div>
            <div>
              <label className="field-label">Branch</label>
              <input className="field-input" placeholder="main" value={form.branch}
                onChange={e => setField('branch', e.target.value)} />
            </div>
          </div>

          <div>
            <label className="field-label">Purpose</label>
            <input className="field-input full" placeholder="What does this project do?"
              value={form.purpose} onChange={e => setField('purpose', e.target.value)} />
          </div>

          <div className="reg-form-row">
            <div>
              <label className="field-label">Default VPS server</label>
              <select className="field-input" value={form.deployServerId}
                onChange={e => setField('deployServerId', e.target.value)}>
                <option value="">— none —</option>
                {servers.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label className="field-label">Clone path on VPS</label>
              <input className="field-input" placeholder="/home/user/app" value={form.clonePath}
                onChange={e => setField('clonePath', e.target.value)} />
            </div>
          </div>

          <div>
            <label className="field-label">Env notes</label>
            <textarea className="field-textarea" rows={2}
              placeholder="Requires: DATABASE_URL, JWT_SECRET, STRIPE_KEY"
              value={form.envInfo} onChange={e => setField('envInfo', e.target.value)} />
          </div>

          {error && <p className="error-text">{error}</p>}

          <div className="reg-actions">
            <button type="submit" className="primary-btn" disabled={saving}>
              {saving ? 'Saving…' : 'Register'}
            </button>
            <button type="button" className="ghost-btn" onClick={() => setShowForm(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {repos.length === 0 && !loading && (
        <div className="reg-empty">
          <span>No repositories registered yet.</span>
          <p>Register a repository to let the AI resolve it by name.</p>
        </div>
      )}

      <div className="card-list">
        {repos.map(r => (
          <div key={r.id} className={`reg-card ${activeRepoName === r.name ? 'reg-card-active' : ''}`}>
            <div className="reg-card-top">
              <div>
                <span className="reg-slug">{r.name}</span>
                <span className="reg-label">{r.label}</span>
                {r.owner && <span className="reg-github">{r.owner}/{r.repo}:{r.branch}</span>}
              </div>
              <div className="reg-card-btns">
                {r.owner && r.repo && (
                  <button className="primary-btn reg-select-btn" onClick={() => handleSelect(r)}>
                    {activeRepoName === r.name ? 'Active' : 'Use in Chat'}
                  </button>
                )}
                <button className="ghost-btn danger" onClick={() => handleDelete(r.name, r.label)}>
                  Remove
                </button>
              </div>
            </div>
            {r.purpose && <p className="reg-purpose">{r.purpose}</p>}
            <div className="reg-meta">
              {r.deploy_server_id && <span>VPS: {r.deploy_server_id}</span>}
              {r.clone_path && <span>Path: {r.clone_path}</span>}
              {r.env_info && <span>Env: {r.env_info.slice(0, 80)}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
