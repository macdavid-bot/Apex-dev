import { useState } from 'react';

export default function SSHKeyManager({ onSave }) {
  const [name, setName] = useState('');
  const [key, setKey] = useState('');

  function handleSave() {
    if (!name || !key) {
      return alert('SSH key name and value are required');
    }

    onSave({ name, key });
  }

  return (
    <div className="ssh-key-manager">
      <h2>SSH Key Manager</h2>

      <input
        placeholder="SSH Key Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />

      <textarea
        placeholder="Paste SSH Private Key"
        value={key}
        onChange={(e) => setKey(e.target.value)}
      />

      <button onClick={handleSave}>Save SSH Key</button>
    </div>
  );
}
