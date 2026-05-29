import { useState, useEffect } from 'react';
import ApprovalCard from './ApprovalCard';
import './Panel.css';

export default function ApprovalPanel() {
  const [approvals, setApprovals] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);

  useEffect(() => {
    fetch('/approvals')
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(data => setApprovals(Array.isArray(data) ? data : []))
      .catch(e => setError(`Could not load approvals (${e})`))
      .finally(() => setLoading(false));
  }, []);

  async function handleApprove(id) {
    await fetch(`/approvals/${id}/approve`, { method: 'POST' });
    setApprovals(prev => prev.map(a => a.id === id ? { ...a, status: 'approved' } : a));
  }

  async function handleReject(id) {
    await fetch(`/approvals/${id}/reject`, { method: 'POST' });
    setApprovals(prev => prev.map(a => a.id === id ? { ...a, status: 'rejected' } : a));
  }

  const pending = approvals.filter(a => a.status === 'pending');

  return (
    <div className="panel">
      <div className="panel-title">
        <h2>Approval Center</h2>
        <p>{pending.length} pending approval{pending.length !== 1 ? 's' : ''}</p>
      </div>
      {loading && <p className="muted">Loading approvals…</p>}
      {error   && <p className="error-text">{error}</p>}
      {!loading && !error && approvals.length === 0 && (
        <p className="muted">No pending approvals. The AI will request your sign-off here before executing changes.</p>
      )}
      <div className="card-list">
        {approvals.map(a => (
          <ApprovalCard
            key={a.id}
            title={a.title}
            description={a.description}
            status={a.status}
            onApprove={() => handleApprove(a.id)}
            onReject={() => handleReject(a.id)}
          />
        ))}
      </div>
    </div>
  );
}
