export default function ApprovalCard({ title, description, onApprove, onReject }) {
  return (
    <div className="approval-card">
      <h3>{title}</h3>
      <p>{description}</p>

      <div>
        <button onClick={onApprove}>Approve</button>
        <button onClick={onReject}>Reject</button>
      </div>
    </div>
  );
}
