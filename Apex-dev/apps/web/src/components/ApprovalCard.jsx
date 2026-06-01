import './ApprovalCard.css';

export default function ApprovalCard({ title, description, status, onApprove, onReject }) {
  const isPending = status === 'pending' || !status;

  return (
    <div className={`approval-card ${status || 'pending'}`}>
      <div className="ac-header">
        <span className="ac-title">{title}</span>
        <span className={`ac-badge ${status || 'pending'}`}>{status || 'pending'}</span>
      </div>
      {description && <p className="ac-desc">{description}</p>}
      {isPending && (
        <div className="ac-actions">
          <button className="btn-approve" onClick={onApprove}>Approve</button>
          <button className="btn-reject"  onClick={onReject}>Reject</button>
        </div>
      )}
    </div>
  );
}
