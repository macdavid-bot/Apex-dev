import { useEffect, useRef } from 'react';
import './ChatWorkspace.css';

export default function ChatWorkspace({ messages = [], loading = false }) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  return (
    <div className="chat-messages">
      {messages.map((msg, i) => (
        <div key={i} className={`message-row ${msg.role}`}>
          <div className="message-bubble">
            <pre className="message-text">{msg.content}</pre>
          </div>
        </div>
      ))}
      {loading && (
        <div className="message-row assistant">
          <div className="message-bubble typing">
            <span /><span /><span />
          </div>
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}
