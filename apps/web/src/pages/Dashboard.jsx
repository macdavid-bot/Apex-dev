import { useState, useRef } from 'react';
import ChatWorkspace from '../components/ChatWorkspace';
import ApprovalPanel from '../components/ApprovalPanel';
import DeploymentPanel from '../components/DeploymentPanel';
import RepositoryExplorer from '../components/RepositoryExplorer';
import TerminalPanel from '../components/TerminalPanel';
import ValidationPanel from '../components/ValidationPanel';
import WorkflowTimeline from '../components/WorkflowTimeline';
import SSHKeyManager from '../components/SSHKeyManager';
import { authHeaders, getToken } from '../hooks/useAuth';
import './Dashboard.css';

const TABS = [
  { id: 'chat',       label: 'Chat',       icon: '💬' },
  { id: 'workflows',  label: 'Workflows',  icon: '⚙️' },
  { id: 'approvals',  label: 'Approvals',  icon: '✅' },
  { id: 'repository', label: 'Repository', icon: '📁' },
  { id: 'terminal',   label: 'Terminal',   icon: '🖥️' },
  { id: 'validation', label: 'Validation', icon: '🔍' },
  { id: 'deployment', label: 'Deployment', icon: '🚀' },
  { id: 'ssh',        label: 'SSH Keys',   icon: '🔑' },
];

export default function Dashboard({ user, onLogout }) {
  const [activeTab, setActiveTab]   = useState('chat');
  const [sidebarOpen, setSidebar]   = useState(true);

  // Conversation state
  const [messages, setMessages]     = useState([
    { role: 'assistant', content: 'Apex Dev initialized. How can I assist with your engineering tasks?' }
  ]);
  const [input, setInput]           = useState('');
  const [loading, setLoading]       = useState(false);
  const [streaming, setStreaming]   = useState('');   // partial streamed text
  const [convId, setConvId]         = useState(null);
  const [repoCtx, setRepoCtx]       = useState(null);
  const [fileCtx, setFileCtx]       = useState(null);

  // New conversation modal — SSH key entry
  const [showSshModal, setShowSshModal] = useState(false);
  const [pendingMsg, setPendingMsg]     = useState('');
  const [sshKeyInput, setSshKeyInput]   = useState('');
  const sseRef = useRef(null);

  function handleRepoLoaded(repo) {
    setConvId(null);
    setRepoCtx(repo);
    setMessages([{
      role: 'assistant',
      content: `Repository loaded: **${repo.owner}/${repo.repo}** (${repo.fileCount} files, ${repo.language || 'unknown language'})\n\nI have the full file tree in context. I can:\n• Explain, review, or refactor code\n• Add features to specific files\n• Run tests and open pull requests\n\nOpen any file and say "edit this file" to start.`
    }]);
  }

  function handleFileLoaded(file) { setFileCtx(file); }
  function askAI(prompt) { setActiveTab('chat'); setInput(prompt); }

  // Start a new chat (reset conversation)
  function newChat() {
    setConvId(null);
    setStreaming('');
    setMessages([{ role: 'assistant', content: 'New conversation started. How can I help?' }]);
    sseRef.current?.close();
  }

  async function sendMessage(text, sshKey = null) {
    if (!text.trim() || loading) return;

    const displayMsg = fileCtx ? `[Viewing: ${fileCtx.path}]\n${text}` : text;
    setMessages(prev => [...prev, { role: 'user', content: displayMsg }]);
    setInput('');
    setLoading(true);
    setStreaming('');

    const isNewConv = !convId;

    try {
      const res = await fetch('/orchestrator/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          message: text,
          conversationId: convId,
          repoContext: isNewConv ? repoCtx : undefined,
          fileContext: fileCtx || undefined,
          sshKey: isNewConv ? sshKey : undefined
        })
      });

      const data = await res.json();
      setFileCtx(null);

      if (!res.ok) {
        setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${data.error || res.status}` }]);
        setLoading(false);
        return;
      }

      if (data.conversationId) setConvId(data.conversationId);

      // Subscribe to live job stream
      const jobId = data.jobId;
      let accumulated = '';
      let executedActions = [];

      const evtSource = new EventSource(`/jobs/${jobId}/stream?token=${encodeURIComponent(getToken())}`);
      sseRef.current = evtSource;

      evtSource.addEventListener('connected', () => {});

      evtSource.addEventListener('token', e => {
        const { token } = JSON.parse(e.data);
        accumulated += token;
        setStreaming(accumulated);
      });

      evtSource.addEventListener('action', e => {
        const { action } = JSON.parse(e.data);
        executedActions.push(action);
      });

      evtSource.addEventListener('progress', e => {
        const { progress } = JSON.parse(e.data);
        setStreaming(prev => prev || `_${progress}_`);
      });

      evtSource.addEventListener('done', e => {
        const result = JSON.parse(e.data);
        evtSource.close();
        sseRef.current = null;
        setStreaming('');
        const finalContent = result.result?.response || accumulated || 'Task completed.';
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: finalContent,
          actions: result.result?.executedActions || executedActions
        }]);
        setLoading(false);
      });

      evtSource.addEventListener('error', e => {
        evtSource.close();
        sseRef.current = null;
        const errData = e.data ? JSON.parse(e.data) : {};
        setStreaming('');
        if (accumulated) {
          setMessages(prev => [...prev, { role: 'assistant', content: accumulated }]);
        } else {
          setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${errData.error || 'Task failed'}` }]);
        }
        setLoading(false);
      });

      evtSource.onerror = () => {
        // If SSE drops but we already got tokens, it might just be the stream closing
        if (!evtSource.readyState === EventSource.CLOSED) return;
        evtSource.close();
        sseRef.current = null;
        setStreaming('');
        if (accumulated) {
          setMessages(prev => [...prev, { role: 'assistant', content: accumulated }]);
        }
        setLoading(false);
      };

    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Could not reach the API.' }]);
      setLoading(false);
    }
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || loading) return;

    // First message of a new conv — show SSH modal (only if repo is loaded, or always)
    if (!convId) {
      setPendingMsg(text);
      setShowSshModal(true);
      return;
    }

    sendMessage(text);
  }

  function handleSshModalSubmit(skip = false) {
    const key = skip ? null : sshKeyInput.trim() || null;
    setShowSshModal(false);
    setSshKeyInput('');
    sendMessage(pendingMsg, key);
    setPendingMsg('');
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }

  const activeTabInfo = TABS.find(t => t.id === activeTab);

  return (
    <div className={`dashboard ${sidebarOpen ? 'sidebar-expanded' : 'sidebar-collapsed'}`}>

      {/* ── SSH Key Modal ── */}
      {showSshModal && (
        <div className="modal-overlay" onClick={() => { setShowSshModal(false); }}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>New Conversation — SSH Key</h3>
              <p className="muted" style={{ margin: '6px 0 0', fontSize: 13 }}>
                Paste an SSH private key so the AI can run commands on your VPS.<br />
                Skip if you only need GitHub repo editing.
              </p>
            </div>
            <textarea
              className="modal-ssh-input"
              placeholder="-----BEGIN OPENSSH PRIVATE KEY-----&#10;...&#10;-----END OPENSSH PRIVATE KEY-----"
              value={sshKeyInput}
              onChange={e => setSshKeyInput(e.target.value)}
              rows={8}
            />
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => handleSshModalSubmit(true)}>
                Skip (repo only)
              </button>
              <button className="btn-primary" onClick={() => handleSshModalSubmit(false)}>
                {sshKeyInput.trim() ? 'Start with SSH Key' : 'Start without key'}
              </button>
            </div>
          </div>
        </div>
      )}

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
        <div className="sidebar-footer">
          {sidebarOpen && (
            <div style={{ fontSize: 12, color: '#8b949e', marginBottom: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user?.username}
            </div>
          )}
          <button className="nav-item" onClick={onLogout} title="Sign out" style={{ width: '100%' }}>
            <span className="nav-icon">🚪</span>
            {sidebarOpen && <span className="nav-label">Sign out</span>}
          </button>
        </div>
        <div className="sidebar-status">
          <span className="status-dot online" />
          {sidebarOpen && <span>{repoCtx ? `📁 ${repoCtx.repo}` : 'API Connected'}</span>}
        </div>
      </aside>

      <main className="main">
        <div className="topbar">
          <button className="sidebar-toggle" onClick={() => setSidebar(o => !o)}
            title={sidebarOpen ? 'Collapse' : 'Expand'}>
            {sidebarOpen ? '◀' : '▶'}
          </button>
          <span className="topbar-title">{activeTabInfo?.icon} {activeTabInfo?.label}</span>
          {activeTab === 'chat' && (
            <button
              className="ghost-btn"
              onClick={newChat}
              style={{ marginLeft: 'auto', marginRight: 8, fontSize: 12 }}
              title="New conversation"
            >
              + New Chat
            </button>
          )}
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
            <ChatWorkspace messages={messages} loading={loading} streamingContent={streaming} />
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
