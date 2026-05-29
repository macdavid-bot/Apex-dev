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
  const [activeTab, setActiveTab]   = useState('chat');
  const [sidebarOpen, setSidebar]   = useState(true);
  const [messages, setMessages]     = useState([
    { role: 'assistant', content: 'Apex Dev initialized. How can I assist with your engineering tasks?' }
  ]);
  const [input, setInput]         = useState('');
  const [loading, setLoading]     = useState(false);
  const [sshKeys, setSshKeys]     = useState([]);
  const [convId, setConvId]       = useState(null);

  async function handleSend() {
    const text = input.trim();
    if (!text || loading) return;
    setMessages(prev => [...prev, { role: 'user', content: text }]);
    setInput('');
    setLoading(true);
    try {
      const res = await fetch('/orchestrator/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, conversationId: convId })
      });
      const data = await res.json();
      if (res.ok) {
        if (data.conversationId) setConvId(data.conversationId);
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: data.response
        }]);
      } else {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `Error: ${data.error || res.status}`
        }]);
      }
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Could not reach the backend API.'
      }]);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function selectTab(id) {
    setActiveTab(id);
  }

  const activeTabInfo = TABS.find(t => t.id === activeTab);

  return (
    <div className={`dashboard ${sidebarOpen ? 'sidebar-expanded' : 'sidebar-collapsed'}`}>

      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <span className="brand-icon">⬡</span>
          {sidebarOpen && <span className="brand-name">Apex Dev</span>}
        </div>

        <nav className="sidebar-nav">
          {TABS.map(tab => (
            <button
              key={tab.id}
              className={`nav-item ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => selectTab(tab.id)}
              title={tab.label}
            >
              <span className="nav-icon">{tab.icon}</span>
              {sidebarOpen && <span className="nav-label">{tab.label}</span>}
            </button>
          ))}
        </nav>

        <div className="sidebar-status">
          <span className="status-dot online" />
          {sidebarOpen && <span>API Connected</span>}
        </div>
      </aside>

      {/* Main content */}
      <main className="main">

        {/* Top bar with toggle + current panel name */}
        <div className="topbar">
          <button
            className="sidebar-toggle"
            onClick={() => setSidebar(o => !o)}
            title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            {sidebarOpen ? '◀' : '▶'}
          </button>
          <span className="topbar-title">
            {activeTabInfo?.icon} {activeTabInfo?.label}
          </span>
        </div>

        {/* Panel content */}
        {activeTab === 'chat' && (
          <div className="chat-layout">
            <ChatWorkspace messages={messages} loading={loading} />
            <div className="chat-footer">
              <textarea
                className="chat-input"
                placeholder="Describe an engineering task, ask about a repo, or request a deployment…"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                rows={3}
                disabled={loading}
              />
              <button
                className={`send-btn ${loading ? 'loading' : ''}`}
                onClick={handleSend}
                disabled={loading}
              >
                {loading ? '…' : 'Send'}
              </button>
            </div>
          </div>
        )}
        {activeTab === 'workflows'  && <WorkflowTimeline />}
        {activeTab === 'approvals'  && <ApprovalPanel />}
        {activeTab === 'repository' && <RepositoryExplorer />}
        {activeTab === 'terminal'   && <TerminalPanel />}
        {activeTab === 'validation' && <ValidationPanel />}
        {activeTab === 'deployment' && <DeploymentPanel />}
        {activeTab === 'ssh'        && <SSHKeyManager keys={sshKeys} onSave={k => setSshKeys(p => [...p, k])} />}
      </main>
    </div>
  );
}
