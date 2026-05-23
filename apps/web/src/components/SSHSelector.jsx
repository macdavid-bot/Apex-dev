export default function SSHSelector({ keys = [], activeKey, onSelect }) {
  return (
    <div className="ssh-selector">
      <select
        value={activeKey || ''}
        onChange={(e) => onSelect(e.target.value)}
      >
        <option value="">Select SSH Key</option>

        {keys.map((key) => (
          <option key={key.name} value={key.name}>
            {key.name}
          </option>
        ))}
      </select>
    </div>
  );
}
