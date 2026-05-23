export default function ChatWorkspace({ messages = [] }) {
  return (
    <div className="chat-workspace">
      {messages.map((message, index) => (
        <div key={index} className={`message ${message.role}`}>
          <p>{message.content}</p>
        </div>
      ))}
    </div>
  );
}
