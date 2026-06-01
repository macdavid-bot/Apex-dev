import { useState, useEffect } from 'react';
import { authHeaders } from '../hooks/useAuth';
import './Panel.css';
import './MemoryPanel.css';

const CATEGORIES = ['architecture', 'instruction', 'infrastructure', 'deployment', 'preference', 'fact'];

const CAT_COLORS = {
  architecture:   '#58a6ff',
  instruction:    '#f78166',
  infrastructure: '#56d364',
  deployment:     '#e3b341',
  preference:     '#bc8cff',
  fact:           '#8b949e'
};

export default function MemoryPanel() {
  const [entries, setEntries]     = useState([]);
  const [loading, setLoading]     = useState(false);
  const [filter, setFilter]       = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [showAdd, setShowAdd]     = useState(false);
  const [form, setForm]           = useState({ category: 'fact', key: '', value: '', repoName: '' });
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState('');

  async function fetchMemory() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter)    params.set('query', filter);
      if (catFilter) params.set('category', catFilter);
      params.set('limit', '100');
      const res = await fetch(`/memory/agent?${params}`, { headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        setEntries(data.entries || []);
      }
    } catch {}
    setLoading(false);
  }

  useEffect(() => { fetchMemory(); }, [catFilter]);

  function setField(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function handleSave(e) {
    e.preventDefault();
    if (!form.key || !form.value) return;
    setSaving(true); setError('');
    try {
      const res = await fetch('/memory/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(form)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setForm({ category: 'fact', key: '', value: '', repoName: '' });
      setShowAdd(false);
      await fetchMemory();
    } catch (err) {
      setError(err.message);
    }
    setSaving(false);
  }

  async function handleForget(id, key) {
    if (!window.confirm(`Forget "${key}"?`)) return;
    await fetch(`/memory/agent/${id}`, { method: 'DELETE', headers: authHeaders() });
    setEntries(e => e.filter(x => x.id !== id));
  }

  // Group by category for display
  const grouped = {};
  for (const e of entries) {
    if (!grouped[e.category]) grouped[e.category] = [];
    grouped[e.category].push(e);
  }

  return (
    <div className="panel">
      <div className="panel-title">
        <h2>Agent Memory</h2>
        <p>Persistent cross-session knowledge — architecture notes, instructions, infrastructure facts.</p>
      </div>

      <div className="mem-toolbar">
        <input className="field-input mem-search" placeholder="Search memory…"
          value={filter} onChange={e => setFilter(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && fetchMemory()} />
        <select className="field-input mem-cat-select" value={catFilter}
          onChange={e => setCatFilter(e.target.value)}>
          <option value="">All categories</option>
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <button className="ghost-btn" onClick={fetchMemory} disabled={loading}>
          {loading ? '…' : 'Search'}
        </button>
        <button className="primary-btn" onClick={() => setShowAdd(v => !v)}>
          {showAdd ? 'Cancel' : '+ Remember'}
        </button>
      </div>

      {showAdd && (
        <form className="mem-add-form" onSubmit={handleSave}>
          <div className="mem-add-row">
            <div>
              <label className="field-label">Category</label>
              <select className="field-input" value={form.category}
                onChange={e => setField('category', e.target.value)}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div style={{ flex: 2 }}>
              <label className="field-label">Key / title</label>
              <input className="field-input" placeholder="e.g. Deploy process" value={form.key}
                onChange={e => setField('key', e.target.value)} required />
            </div>
            <div>
              <label className="field-label">Scope (repo slug)</label>
              <input className="field-input" placeholder="all repos" value={form.repoName}
                onChange={e => setField('repoName', e.target.value)} />
            </div>
          </div>
          <div>
            <label className="field-label">Value</label>
            <textarea className="field-textarea" rows={3}
              placeholder="What should be remembered?"
              value={form.value} onChange={e => setField('value', e.target.value)} required />
          </div>
          {error && <p className="error-text">{error}</p>}
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="submit" className="primary-btn" disabled={saving}>
              {saving ? 'Saving…' : 'Save Memory'}
            </button>
          </div>
        </form>
      )}

      {entries.length === 0 && !loading && (
        <div className="mem-empty">
          <span>No memories stored yet.</span>
          <p>The AI will remember things here automatically, or you can add entries manually.</p>
        </div>
      )}

      {Object.entries(grouped).map(([cat, items]) => (
        <div key={cat} className="mem-group">
          <div className="mem-group-header">
            <span className="mem-cat-badge" style={{ background: CAT_COLORS[cat] + '22', color: CAT_COLORS[cat] }}>
              {cat}
            </span>
            <span className="mem-count">{items.length}</span>
          </div>
          <div className="card-list">
            {items.map(e => (
              <div key={e.id} className="mem-card">
                <div className="mem-card-top">
                  <span className="mem-key">{e.key}</span>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {e.repo_name && <span className="mem-scope">{e.repo_name}</span>}
                    <button className="ghost-btn danger" onClick={() => handleForget(e.id, e.key)}>Forget</button>
                  </div>
                </div>
                <p className="mem-value">{e.value}</p>
                <span className="mem-date">{new Date(e.created_at).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
