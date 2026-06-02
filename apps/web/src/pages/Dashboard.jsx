import { useState, useRef, useEffect, useCallback } from 'react';
import ChatWorkspace from '../components/ChatWorkspace';
import ApprovalPanel from '../components/ApprovalPanel';
import DeploymentPanel from '../components/DeploymentPanel';
import RepositoryExplorer from '../components/RepositoryExplorer';
import RepositoryRegistry from '../components/RepositoryRegistry';
import TerminalPanel from '../components/TerminalPanel';
import ValidationPanel from '../components/ValidationPanel';
import WorkflowTimeline from '../components/WorkflowTimeline';
import SSHKeyManager from '../components/SSHKeyManager';
import VPSManager from '../components/VPSManager';
import VPSFileBrowser from '../components/VPSFileBrowser';
import MemoryPanel from '../components/MemoryPanel';
import RollbackPanel from '../components/RollbackPanel';
import DomainManager from '../components/DomainManager';
import DatabaseAdmin from '../components/DatabaseAdmin';
import HealthMonitor from '../components/HealthMonitor';
import { authHeaders, getToken } from '../hooks/useAuth';
import './Dashboard.css';

const TABS = [
  { id: 'chat',       label: 'Chat',        icon: '💬' },
  { id: 'workflows',  label: 'Workflows',   icon: '⚙️' },
  { id: 'approvals',  label: 'Approvals',   icon: '✅' },
  { id: 'registry',   label: 'Repos',       icon: '🗂️' },
  { id: 'repository', label: 'File Browser',icon: '📁' },
  { id: 'terminal',   label: 'Terminal',    icon: '🖥️' },
  { id: 'validation', label: 'Validation',  icon: '🔍' },
  { id: 'deployment', label: 'Deployment',  icon: '🚀' },
  { id: 'vps',        label: 'VPS Servers', icon: '⚡' },
  { id: 'vfsb',       label: 'VPS Files',   icon: '🗄️' },
  { id: 'memory',     label: 'Memory',      icon: '🧠' },
  { id: 'rollback',   label: 'Rollback',    icon: '↩️' },
  { id: 'domains',    label: 'Domains',     icon: '🌐' },
  { id: 'db',         label: 'DB Admin',    icon: '🗃️' },
  { id: 'health',     label: 'Health',      icon: '💊' },
  { id: 'ssh',        label: 'SSH Keys',    icon: '🔑' },
];

function formatRelative(dateStr) {
  if (!dateStr) return '';
  const diff = (Date.now() - new Date(dateStr)) / 1000;
  if (diff < 60)    return 'just now';
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function Dashboard({ user, onLogout }) {
  const [activeTab, setActiveTab]   = useState('chat');
  const [sidebarOpen, setSidebar]   = useState(true);

  // Conversation state
  const [messages, setMessages]     = useState([
    { role: 'assistant', content: 'Apex Dev initialized. How can I assist with your engineering tasks?' }
  ]);
  const [input, setInput]           = useState('');
  const [loading, setLoading]       = useState(false);
  const [streaming, setStreaming]   = useState('');
  const [liveSteps, setLiveSteps]   = useState([]);
  const [convId, setConvId]         = useState(null);
  const [repoCtx, setRepoCtx]       = useState(null);
  const [fileCtx, setFileCtx]       = useState(null);

  // Conversation history
  const [conversations, setConversations]   = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // VPS servers (for redeploy CTA)
  const [vpsServers, setVpsServers]   = useState([]);
  const [showRedeployCta, setShowRedeployCta] = useState(false);
  const [redeployServerId, setRedeployServerId] = useState('');

  // SSH modal
  const [showSshModal, setShowSshModal] = useState(false);
  const [pendingMsg, setPendingMsg]     = useState('');
  const [sshKeyInput, setSshKeyInput]   = useState('');
  const sseRef = useRef(null);

  // ── Fetch helpers ──────────────────────────────────────────────────────────

  const fetchConversations = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch('/orchestrator/conversations', { headers: authHeaders() });
      if (res.ok) setConversations(await res.json());
    } catch {}
    setHistoryLoading(false);
  }, []);

  const fetchVpsServers = useCallback(async () => {
    try {
      const res = await fetch('/vps/servers', { headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        setVpsServers(data);
        if (data.length > 0 && !redeployServerId) setRedeployServerId(data[0].id);
      }
    } catch {}
  }, [redeployServerId]);

  useEffect(() => {
    fetchConversations();
    fetchVpsServers();
  }, []);

  // ── Load conversation from history ────────────────────────────────────────

  async function loadConversation(conv) {
    if (sseRef.current) { sseRef.current.close(); sseRef.current = null; }
    setLoading(false);
    setStreaming('');
    setLiveSteps([]);
    setShowRedeployCta(false);
    setConvId(conv.id);

    if (conv.repo_owner) {
      setRepoCtx({ owner: conv.repo_owner, repo: conv.repo_name, branch: conv.repo_branch || 'main' });
    }

    try {
      const res = await fetch(`/orchestrator/conversations/${conv.id}`, { headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        const msgs = data.messages
          .filter(m => m.role !== 'system')
          .map(m => ({ role: m.role, content: m.content, actions: m.actions }));
        setMessages(msgs.length > 0 ? msgs : [{ role: 'assistant', content: 'Conversation loaded.' }]);
      }
    } catch {
      setMessages([{ role: 'assistant', content: 'Could not load conversation.' }]);
    }
    setActiveTab('chat');
  }

  // ── Repo & file handlers ──────────────────────────────────────────────────

  function handleRepoLoaded(repo) {
    setConvId(null);
    setRepoCtx(repo);
    setLiveSteps([]);
    setShowRedeployCta(false);
    setMessages([{
      role: 'assistant',
      content: `Repository loaded: **${repo.owner}/${repo.repo}** (${repo.fileCount} files, ${repo.language || 'unknown language'})\n\nI have the full file tree in context. I can:\n• Explain, review, or refactor code\n• Add features to specific files\n• Run tests and open pull requests\n\nOpen any file and say "edit this file" to start.`
    }]);
  }

  function handleFileLoaded(file) { setFileCtx(file); }
  function askAI(prompt) { setActiveTab('chat'); setInput(prompt); }

  function newChat() {
    if (sseRef.current) { sseRef.current.close(); sseRef.current = null; }
    setConvId(null);
    setStreaming('');
    setLiveSteps([]);
    setShowRedeployCta(false);
    setMessages([{ role: 'assistant', content: 'New conversation started. How can I help?' }]);
  }

  // ── Send message ──────────────────────────────────────────────────────────

  async function sendMessage(text, sshKey = null) {
    if (!text.trim() || loading) return;

    const displayMsg = fileCtx ? `[Viewing: ${fileCtx.path}]\n${text}` : text;
    setMessages(prev => [...prev, { role: 'user', content: displayMsg }]);
    setInput('');
    setLoading(true);
    setStreaming('');
    setLiveSteps([]);
    setShowRedeployCta(false);

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

      if (data.conversationId) {
        setConvId(data.conversationId);
        // Refresh history after short delay
        setTimeout(fetchConversations, 1500);
      }

      const jobId = data.jobId;
      let accumulated  = '';
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

      evtSource.addEventListener('step', e => {
        const { step } = JSON.parse(e.data);
        setLiveSteps(prev => {
          const idx = prev.findIndex(s => s.index === step.index);
          if (idx >= 0) {
            const updated = [...prev];
            updated[idx] = step;
            return updated;
          }
          return [...prev, step];
        });
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
        setLiveSteps([]);

        const finalContent  = result.result?.response || accumulated || 'Task completed.';
        const finalActions  = result.result?.executedActions || executedActions;

        setMessages(prev => [...prev, { role: 'assistant', content: finalContent, actions: finalActions }]);
        setLoading(false);

        // Show redeploy CTA if there were code changes and VPS servers exist
        const hadEdits = finalActions.some(a => ['edit_file', 'create_pull_request', 'run_tests'].includes(a.type));
        if (hadEdits && vpsServers.length > 0) {
          setShowRedeployCta(true);
        }

        setTimeout(fetchConversations, 1000);
      });

      evtSource.addEventListener('error', e => {
        evtSource.close();
        sseRef.current = null;
        const errData = e.data ? JSON.parse(e.data) : {};
        setStreaming('');
        setLiveSteps([]);
        if (accumulated) {
          setMessages(prev => [...prev, { role: 'assistant', content: accumulated }]);
        } else {
          setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${errData.error || 'Task failed'}` }]);
        }
        setLoading(false);
      });

      evtSource.onerror = () => {
        if (evtSource.readyState === EventSource.CLOSED) return;
        evtSource.close();
        sseRef.current = null;
        setStreaming('');
        setLiveSteps([]);
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

  function handleRedeploy() {
    setShowRedeployCta(false);
    const server = vpsServers.find(s => s.id === redeployServerId) || vpsServers[0];
    if (!server) return;
    sendMessage(`Deploy the latest changes to the VPS server "${server.label}" (ID: ${server.id}). Pull from GitHub${server.deploy_dir ? `, cd to ${server.deploy_dir},` : ''} install dependencies, and restart the service.`);
  }

  const activeTabInfo = TABS.find(t => t.id === activeTab);

  return (
    <div className={`dashboard ${sidebarOpen ? 'sidebar-expanded' : 'sidebar-collapsed'}`}>

      {/* ── SSH Key Modal ── */}
      {showSshModal && (
        <div className="modal-overlay" onClick={() => setShowSshModal(false)}>
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
              placeholder={'-----BEGIN OPENSSH PRIVATE KEY-----\n...\n-----END OPENSSH PRIVATE KEY-----'}
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

      {/* ── Sidebar ── */}
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

        {/* Conversation history */}
        {sidebarOpen && conversations.length > 0 && (
          <div className="sidebar-history">
            <div className="sidebar-history-title">
              Recent
              {historyLoading && <span className="history-loading">…</span>}
            </div>
            {conversations.slice(0, 12).map(c => (
              <button
                key={c.id}
                className={`history-item ${c.id === convId ? 'history-item-active' : ''}`}
                onClick={() => loadConversation(c)}
                title={`${c.repo_name || 'General'} — ${formatRelative(c.updated_at)}`}
              >
                <span className="history-repo">{c.repo_name || 'General'}</span>
                <span className="history-date">{formatRelative(c.updated_at)}</span>
              </button>
            ))}
          </div>
        )}

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

      {/* ── Main ── */}
      <main className="main">
        <div className="topbar">
          <button className="sidebar-toggle" onClick={() => setSidebar(o => !o)}
            title={sidebarOpen ? 'Collapse' : 'Expand'}>
            {sidebarOpen ? '◀' : '▶'}
          </button>
          <span className="topbar-title">{activeTabInfo?.icon} {activeTabInfo?.label}</span>
          {activeTab === 'chat' && (
            <button className="ghost-btn" onClick={newChat}
              style={{ marginLeft: 'auto', marginRight: 8, fontSize: 12 }}
              title="New conversation">
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
            <ChatWorkspace messages={messages} loading={loading} streamingContent={streaming} liveSteps={liveSteps} />

            {/* Redeploy CTA */}
            {showRedeployCta && (
              <div className="redeploy-cta">
                <span className="redeploy-cta-text">
                  🚀 Changes are on GitHub. Deploy to your VPS?
                </span>
                {vpsServers.length > 1 && (
                  <select
                    className="redeploy-server-select"
                    value={redeployServerId}
                    onChange={e => setRedeployServerId(e.target.value)}
                  >
                    {vpsServers.map(s => (
                      <option key={s.id} value={s.id}>{s.label}</option>
                    ))}
                  </select>
                )}
                <button className="redeploy-btn" onClick={handleRedeploy} disabled={loading}>
                  Deploy now
                </button>
                <button className="redeploy-dismiss" onClick={() => setShowRedeployCta(false)} title="Dismiss">✕</button>
              </div>
            )}

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

        {activeTab === 'registry' && (
          <RepositoryRegistry
            activeRepoName={repoCtx?.name}
            onSelectRepo={repo => {
              handleRepoLoaded({ ...repo, fileCount: 0 });
              setActiveTab('chat');
            }}
          />
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
        {activeTab === 'vps'        && <VPSManager onServersChanged={fetchVpsServers} />}
        {activeTab === 'vfsb'       && <VPSFileBrowser />}
        {activeTab === 'memory'     && <MemoryPanel />}
        {activeTab === 'rollback'   && <RollbackPanel />}
        {activeTab === 'domains'    && <DomainManager />}
        {activeTab === 'db'         && <DatabaseAdmin />}
        {activeTab === 'health'     && <HealthMonitor />}
        {activeTab === 'ssh'        && <SSHKeyManager />}
      </main>
    </div>
  );
}
