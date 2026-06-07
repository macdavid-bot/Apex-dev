import { useEffect, useRef } from 'react';
import './ChatWorkspace.css';

// ── Markdown renderer ──────────────────────────────────────────────────────────
function cleanContent(text) {
  // Remove apex-action blocks from display (AI still needs them for reasoning)
  return text.replace(/```apex-action\n[\s\S]*?```\n?/g, '');
}

function renderMarkdown(text) {
  if (!text) return null;
  text = cleanContent(text);
  const lines = text.split('\n');
  const elements = [];
  let i = 0; let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith('```')) {
      const lang = line.slice(3).trim();
      const codeLines = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) { codeLines.push(lines[i]); i++; }
      if (lang !== 'apex-action') {
        elements.push(
          <div key={key++} className="md-code-block">
            {lang && <span className="md-code-lang">{lang}</span>}
            <pre><code>{codeLines.join('\n')}</code></pre>
          </div>
        );
      }
      i++; continue;
    }

    const hMatch = line.match(/^(#{1,3})\s+(.*)/);
    if (hMatch) {
      const lvl = hMatch[1].length;
      const Tag = `h${lvl + 2}`;
      elements.push(<Tag key={key++} className="md-heading">{inlineFormat(hMatch[2])}</Tag>);
      i++; continue;
    }

    if (line.match(/^---+$/)) { elements.push(<hr key={key++} className="md-hr" />); i++; continue; }

    if (line.match(/^[-*]\s+(.*)/)) {
      const items = [];
      while (i < lines.length && lines[i].match(/^[-*]\s+(.*)/)) {
        items.push(lines[i].match(/^[-*]\s+(.*)/)[1]); i++;
      }
      elements.push(<ul key={key++} className="md-list">{items.map((it, j) => <li key={j}>{inlineFormat(it)}</li>)}</ul>);
      continue;
    }

    if (line.match(/^\d+\.\s+(.*)/)) {
      const items = [];
      while (i < lines.length && lines[i].match(/^\d+\.\s+(.*)/)) {
        items.push(lines[i].match(/^\d+\.\s+(.*)/)[1]); i++;
      }
      elements.push(<ol key={key++} className="md-list">{items.map((it, j) => <li key={j}>{inlineFormat(it)}</li>)}</ol>);
      continue;
    }

    if (line.includes('|') && lines[i + 1]?.match(/^[\s|:-]+$/)) {
      const rows = [];
      while (i < lines.length && lines[i].includes('|')) {
        if (!lines[i].match(/^[\s|:-]+$/)) rows.push(lines[i].split('|').filter(c => c.trim() !== '').map(c => c.trim()));
        i++;
      }
      if (rows.length > 0) {
        const [head, ...body] = rows;
        elements.push(
          <div key={key++} className="md-table-wrap">
            <table className="md-table">
              <thead><tr>{head.map((h, j) => <th key={j}>{inlineFormat(h)}</th>)}</tr></thead>
              <tbody>{body.map((r, j) => <tr key={j}>{r.map((c, k) => <td key={k}>{inlineFormat(c)}</td>)}</tr>)}</tbody>
            </table>
          </div>
        );
      }
      continue;
    }

    if (line.trim() === '') { elements.push(<div key={key++} className="md-spacer" />); i++; continue; }
    elements.push(<p key={key++} className="md-para">{inlineFormat(line)}</p>);
    i++;
  }
  return elements;
}

function inlineFormat(text) {
  const parts = [];
  const regex = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g;
  let last = 0; let k = 0; let match;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) parts.push(<span key={k++}>{text.slice(last, match.index)}</span>);
    const tok = match[0];
    if (tok.startsWith('**'))     parts.push(<strong key={k++}>{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith('*')) parts.push(<em key={k++}>{tok.slice(1, -1)}</em>);
    else                          parts.push(<code key={k++} className="md-inline-code">{tok.slice(1, -1)}</code>);
    last = match.index + tok.length;
  }
  if (last < text.length) parts.push(<span key={k++}>{text.slice(last)}</span>);
  return parts.length ? parts : text;
}

// ── Live Activity Log (step feed) ─────────────────────────────────────────────

const STEP_ICONS = {
  read_file:           '📂',
  edit_file:           '✏️',
  list_files:          '📋',
  search_repo:         '🔎',
  search_code_fts:     '🔎',
  create_branch:       '🌿',
  git_diff:            '🔍',
  run_tests:           '🧪',
  run_local:           '⚡',
  run_vps:             '🖥️',
  create_pull_request: '🔀',
  recall_memory:       '🧠',
  add_memory:          '💾',
  deploy_to_vps:       '🚀',
  set_vps_env:         '🔐',
  auto_deploy:         '🚀',
  auto_setup_db:       '🗄️',
  auto_add_keys:       '🔐',
  auto_connect_domain: '🌐',
  run_vps_sudo:        '⚡',
  debug_self:          '🔧',
  retry_with_fix:      '♻️',
};

function LiveActivityLog({ steps }) {
  if (!steps || steps.length === 0) return null;

  // Deduplicate: keep only the latest entry per step index
  const latestByIdx = new Map();
  for (const s of steps) latestByIdx.set(s.index, s);
  const deduped = [...latestByIdx.values()].sort((a, b) => a.index - b.index);

  return (
    <div className="live-activity-log">
      {deduped.map((step, i) => {
        const icon = STEP_ICONS[step.actionType] || '🔧';
        const isRunning = step.status === 'running';
        const isError   = step.status === 'error';
        return (
          <div key={i} className={`activity-step activity-step-${step.status}`}>
            <span className="activity-status-icon">
              {isRunning ? <span className="spin-icon">⟳</span> : isError ? '✗' : '✓'}
            </span>
            <span className="activity-icon">{icon}</span>
            <span className="activity-label">{step.label}</span>
            {step.detail && !isRunning && (
              <span className="activity-detail">{step.detail.slice(0, 120)}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Completed action steps ─────────────────────────────────────────────────────

const ACTION_ICONS = {
  read_file:            '📂',
  edit_file:            '✏️',
  create_branch:        '🌿',
  run_local:            '⚡',
  run_vps:              '🖥️',
  list_files:           '📋',
  git_diff:             '🔍',
  search_repo:          '🔎',
  search_code_fts:      '🔎',
  run_tests:            '🧪',
  create_pull_request:  '🔀',
  recall_memory:        '🧠',
  add_memory:           '💾',
  deploy_to_vps:        '🚀',
  set_vps_env:          '🔐',
  parse_error:          '⚠️',
  auto_deploy:          '🚀',
  auto_setup_db:        '🗄️',
  auto_add_keys:        '🔐',
  auto_connect_domain:  '🌐',
  run_vps_sudo:         '⚡',
  debug_self:           '🔧',
  retry_with_fix:       '♻️',
};

function ActionSteps({ actions }) {
  if (!actions || actions.length === 0) return null;
  return (
    <div className="action-steps">
      {actions.map((a, i) => {
        const icon  = ACTION_ICONS[a.type] || '🔧';
        const isErr = !!(a.result?.error || a.type === 'parse_error');
        let label   = `${icon} ${a.type}`;
        if (a.type === 'edit_file')           label = `${icon} Edited \`${a.params?.path}\`${a.result?.commitSha ? ' → committed' : ''}`;
        if (a.type === 'read_file')           label = `${icon} Read \`${a.params?.path}\`${a.result?.lines ? ` (${a.result.lines} lines)` : ''}`;
        if (a.type === 'create_branch')       label = `${icon} Branch \`${a.params?.branch}\``;
        if (a.type === 'run_local')           label = `${icon} \`${(a.params?.command || '').slice(0, 60)}\``;
        if (a.type === 'run_vps')             label = `${icon} VPS: \`${(a.params?.command || '').slice(0, 60)}\``;
        if (a.type === 'list_files')          label = `${icon} Listed \`${a.params?.path || '/'}\``;
        if (a.type === 'git_diff')            label = `${icon} Diff \`${a.params?.base}\`→\`${a.params?.head || 'HEAD'}\``;
        if (a.type === 'search_repo')         label = `${icon} Search: "${(a.params?.query || '').slice(0, 40)}"`;
        if (a.type === 'search_code_fts')     label = `${icon} FTS: "${(a.params?.query || '').slice(0, 40)}"`;
        if (a.type === 'run_tests')           label = `${icon} Tests → ${a.result?.passed ? '✅ passed' : '❌ failed'}`;
        if (a.type === 'create_pull_request') label = `${icon} PR #${a.result?.prNumber || '?'}: ${(a.params?.title || '').slice(0, 40)}`;
        if (a.type === 'recall_memory')       label = `${icon} Recalled project memory`;
        if (a.type === 'add_memory')          label = `${icon} Remembered: "${(a.params?.fact || '').slice(0, 50)}"`;
        if (a.type === 'deploy_to_vps')       label = `${icon} Deployed to VPS ${a.result?.error ? '❌' : '✓'}`;
        if (a.type === 'set_vps_env')         label = `${icon} Set \`${a.params?.key}\` on VPS ${a.result?.error ? '❌' : '✓'}`;

        const cmdOutput = ['run_local','run_vps','run_tests','deploy_to_vps'].includes(a.type) && !isErr
          ? ((a.result?.stdout || a.result?.stderr || '').slice(0, 600))
          : null;
        const prUrl = a.type === 'create_pull_request' && a.result?.url;

        return (
          <div key={i} className={`action-step ${isErr ? 'action-step-err' : 'action-step-ok'}`}>
            <span className="action-step-label">{label}</span>
            {isErr && <span className="action-step-detail">{a.result?.error || a.error}</span>}
            {cmdOutput && <pre className="action-step-output">{cmdOutput}{((a.result?.stdout?.length || 0) > 600) ? '…' : ''}</pre>}
            {prUrl && <a className="action-step-link" href={prUrl} target="_blank" rel="noreferrer">View PR ↗</a>}
          </div>
        );
      })}
    </div>
  );
}

// ── Streaming indicator with live log ─────────────────────────────────────────

function StreamingMessage({ content, liveSteps }) {
  const hasSteps = liveSteps && liveSteps.length > 0;
  // Single short status line instead of full log
  const statusLine = hasSteps
    ? liveSteps.filter(s => s.status === 'running').map(s => s.label).join(' • ')
    : '';
  return (
    <div className="message-row assistant">
      <div className="message-bubble streaming-bubble">
        {statusLine && (
          <div className="ai-status">
            <span className="spin-icon">⟳</span> {statusLine}
          </div>
        )}
        {content ? (
          <div className="message-md">{renderMarkdown(content)}<span className="stream-cursor" /></div>
        ) : (
          !statusLine && <div className="typing"><span /><span /><span /></div>
        )}
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function ChatWorkspace({ messages = [], loading = false, streamingContent = '', liveSteps = [] }) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading, streamingContent, liveSteps]);

  return (
    <div className="chat-messages">
      {messages.map((msg, i) => (
        <div key={i} className={`message-row ${msg.role}`}>
          <div className="message-bubble">
            {msg.role === 'assistant' ? (
              <div className="message-md">{renderMarkdown(msg.content)}</div>
            ) : (
              <pre className="message-text">{msg.content}</pre>
            )}
          </div>
        </div>
      ))}

      {loading && <StreamingMessage content={streamingContent} liveSteps={liveSteps} />}

      <div ref={bottomRef} />
    </div>
  );
}
