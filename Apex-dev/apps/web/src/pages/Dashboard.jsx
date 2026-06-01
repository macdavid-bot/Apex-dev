import { useState } from 'react';
import ChatWorkspace from '../components/ChatWorkspace';
import ApprovalPanel from '../components/ApprovalPanel';
import DeploymentPanel from '../components/DeploymentPanel';
import RepositoryExplorer from '../components/RepositoryExplorer';
import TerminalPanel from '../components/TerminalPanel';
import ValidationPanel from '../components/ValidationPanel';
import WorkflowTimeline from '../components/WorkflowTimeline';
import SSHKeyManager from '../components/SSHKeyManager';
import './Dashboard.css';

const TABS = [
  { id: 'chat',       label: 'Chat',        icon: '💬' },
  { id: 'workflows',  label: 'Workflows',   icon: '⚙️' },
  { id: 'approvals',  label: 'Approvals',   icon: '✅' },
  { id: 'repository', label: 'Repository',  icon: '📁' },
  { id: 'terminal',   label: 'Terminal',    icon: '🖥️' },
  { id: 'validation', label: 'Validation',  icon: '🔍' },
  { id: 'deployment', label: 'Deployment',  icon: '🚀' },
  { id: 'ssh',        label: 'SSH Keys',    icon: '🔑' },
];

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState('chat');
  const [sidebarOpen, setSidebar] = useState(true);

  // Chat state
  const [messages, setMessages]   = useState([
    { role: 'assistant', content: 'Apex Dev initialized. How can I assist with your engineering tasks?' }
  ]);
  const [input, setInput]         = useState('');
  const [loading, setLoading]     = useState(false);
  const [convId, setConvId]       = useState(null);

  // Repo / file context (injected into AI on first message of a new conversation)
  const [repoCtx, setRepoCtx]     = useState(null);   // set when user loads a repo
  const [fileCtx, setFileCtx]     = useState(null);   // set when user opens a file

  // Called by RepositoryExplorer when a repo is loaded
  function handleRepoLoaded(repo) {
    // Reset conversation so the new system prompt includes the repo tree
    setConvId(null);
    setRepoCtx(repo);
    setMessages([{
      role: 'assistant',
      content: `Repository loaded: **${repo.owner}/${repo.repo}** (${repo.fileCount} files, ${repo.language || 'unknown language'})\n\nI now have the full file tree in context. You can ask me to:\n• Explain the codebase\n• Add a feature to a specific file\n• Review or refactor code\n• Plan a deployment\n\nOpen any file from the tree and say "edit this file" to start coding.`
    }]);
  }

  // Called by RepositoryExplorer when a file is opened
  function handleFileLoaded(file) {
    setFileCtx(file);
  }

  // Send a message to AI, optionally with a prompt pre-filled
  function askAI(prompt) {
    setActiveTab('chat');
    setInput(prompt);
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || loading) return;

    const displayMsg = fileCtx
      ? `[Viewing: ${fileCtx.path}]\n${text}`
      : text;

    setMessages(prev => [...prev, { role: 'user', content: displayMsg }]);
    setInput('');
    setLoading(true);

    // Only send repoContext on the first message of a new conversation
    const isNewConv = !convId;

    try {
      const res = await fetch('/orchestrator/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          conversationId: convId,
          repoContext: isNewConv ? repoCtx : undefined,
          fileContext: fileCtx || undefined
        })
      });
      const data = await res.json();
      // Clear file context after it's been sent once
      setFileCtx(null);

      if (res.ok) {
        if (data.conversationId) setConvId(data.conversationId);
        setMessages(prev => [...prev, { role: 'assistant', content: data.response }]);
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${data.error || res.status}` }]);
      }
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Could not reach the backend API.' }]);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }

  const activeTabInfo = TABS.find(t => t.id === activeTab);

  return (
    <div className={`dashboard ${sidebarOpen ? 'sidebar-expanded' : 'sidebar-collapsed'}`}>

      <aside className="sidebar">
        <div className="sidebar-brand">
          <span className="brand-icon">⬡</span>
          {sidebarOpen && <span className="brand-name">Apex Dev</span>}
        </div>
        <nav className="sidebar-nav">
          {TABS.map(tab => (
            <button key={tab.id}
              className={`nav-item ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)} title={tab.label}>
              <span className="nav-icon">{tab.icon}</span>
              {sidebarOpen && <span className="nav-label">{tab.label}</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-status">
          <span className="status-dot online" />
          {sidebarOpen && <span>{repoCtx ? `📁 ${repoCtx.repo}` : 'API Connected'}</span>}
        </div>
      </aside>

      <main className="main">
        <div className="topbar">
          <button className="sidebar-toggle" onClick={() => setSidebar(o => !o)}
            title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}>
            {sidebarOpen ? '◀' : '▶'}
          </button>
          <span className="topbar-title">{activeTabInfo?.icon} {activeTabInfo?.label}</span>
          {repoCtx && activeTab !== 'repository' && (
            <span className="repo-badge" title={`${repoCtx.owner}/${repoCtx.repo}`}>
              📁 {repoCtx.repo}
            </span>
          )}
        </div>

        {activeTab === 'chat' && (
          <div className="chat-layout">
            {fileCtx && (
              <div className="file-ctx-bar">
                <span>📄 {fileCtx.path} loaded into context</span>
                <button onClick={() => setFileCtx(null)}>✕</button>
              </div>
            )}
            <ChatWorkspace messages={messages} loading={loading} />
            <div className="chat-footer">
              <textarea className="chat-input"
                placeholder={fileCtx
                  ? `Ask about ${fileCtx.path}, request an edit, or describe a feature…`
                  : 'Describe an engineering task, ask about a repo, or request a deployment…'}
                value={input} onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown} rows={3} disabled={loading} />
              <button className={`send-btn ${loading ? 'loading' : ''}`}
                onClick={handleSend} disabled={loading}>
                {loading ? '…' : 'Send'}
              </button>
            </div>
          </div>
        )}

        {activeTab === 'repository' && (
          <RepositoryExplorer
            onLoadRepo={handleRepoLoaded}
            onLoadFile={handleFileLoaded}
            activeRepo={repoCtx}
            onAskAI={askAI}
          />
        )}

        {activeTab === 'workflows'  && <WorkflowTimeline />}
        {activeTab === 'approvals'  && <ApprovalPanel />}
        {activeTab === 'terminal'   && <TerminalPanel />}
        {activeTab === 'validation' && <ValidationPanel />}
        {activeTab === 'deployment' && <DeploymentPanel />}
        {activeTab === 'ssh'        && <SSHKeyManager />}
      </main>
    </div>
  );
}
