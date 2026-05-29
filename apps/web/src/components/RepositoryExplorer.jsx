import { useState } from 'react';
import './Panel.css';

export default function RepositoryExplorer() {
  const [repoUrl, setRepoUrl] = useState('');
  const [result, setResult]   = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);

  async function handleAnalyze() {
    if (!repoUrl.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/repository/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: repoUrl })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.status);
      setResult(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="panel">
      <div className="panel-title">
        <h2>Repository Explorer</h2>
        <p>Analyze any GitHub repository using AI</p>
      </div>

      <div className="input-row">
        <input
          className="field-input"
          placeholder="https://github.com/owner/repo"
          value={repoUrl}
          onChange={e => setRepoUrl(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAnalyze()}
        />
        <button className="primary-btn" onClick={handleAnalyze} disabled={loading}>
          {loading ? 'Analyzing…' : 'Analyze'}
        </button>
      </div>

      {error && <p className="error-text">{error}</p>}

      {result && (
        <div className="result-block">
          <pre className="result-pre">{JSON.stringify(result, null, 2)}</pre>
        </div>
      )}

      {!result && !loading && !error && (
        <p className="muted">Enter a GitHub repository URL above to start exploring its structure, tech stack, and engineering context.</p>
      )}
    </div>
  );
}
