export default function ChatToolbar({ tools = [], activeTool, onSelectTool }) {
  return (
    <div className="chat-toolbar">
      {tools.map((tool) => (
        <button
          key={tool}
          className={activeTool === tool ? 'active-tool' : ''}
          onClick={() => onSelectTool(tool)}
        >
          {tool}
        </button>
      ))}
    </div>
  );
}
