import { useState, useEffect, useCallback } from 'react';
import ApprovalCard from './ApprovalCard';
import { authHeaders } from '../hooks/useAuth';
import './Panel.css';

export default function ApprovalPanel() {
  const [approvals, setApprovals] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);

  const fetchApprovals = useCallback(async () => {
    try {
      const res = await fetch('/approvals', { headers: authHeaders() });
      if (!res.ok) throw new Error(res.status);
      const data = await res.json();
      setApprovals(Array.isArray(data) ? data : []);
      setError(null);
    } catch (e) {
      setError(`Could not load approvals (${e})`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchApprovals();
    const interval = setInterval(fetchApprovals, 5000);
    return () => clearInterval(interval);
  }, [fetchApprovals]);

  async function handleApprove(id) {
    await fetch(`/approvals/${id}/approve`, { method: 'POST', headers: authHeaders() });
    setApprovals(prev => prev.map(a => a.id === id ? { ...a, status: 'approved' } : a));
  }

  async function handleReject(id) {
    await fetch(`/approvals/${id}/reject`, { method: 'POST', headers: authHeaders() });
    setApprovals(prev => prev.map(a => a.id === id ? { ...a, status: 'rejected' } : a));
  }

  const pending = approvals.filter(a => a.status === 'pending');

  return (
    <div className="panel">
      <div className="panel-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2>Approval Center</h2>
          <p>{pending.length} pending approval{pending.length !== 1 ? 's' : ''}</p>
        </div>
        {pending.length > 0 && (
          <span style={{ background: '#da3633', color: '#fff', borderRadius: 12, padding: '2px 10px', fontSize: 12, fontWeight: 700 }}>
            {pending.length} pending
          </span>
        )}
      </div>

      {loading && <p className="muted">Loading approvals…</p>}
      {error   && <p className="error-text">{error}</p>}
      {!loading && !error && approvals.length === 0 && (
        <p className="muted">No approvals yet. The AI will request your sign-off here before executing sensitive operations.</p>
      )}

      <div className="card-list">
        {approvals.map(a => (
          <ApprovalCard
            key={a.id}
            title={a.title}
            description={a.description}
            status={a.status}
            onApprove={() => handleApprove(a.id)}
            onReject={()  => handleReject(a.id)}
          />
        ))}
      </div>
    </div>
  );
}
