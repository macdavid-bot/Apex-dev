import { useEffect, useRef } from 'react';
import './ChatWorkspace.css';

// Minimal markdown renderer — code blocks, inline code, bold, headers, lists
function renderMarkdown(text) {
  if (!text) return null;
  const lines = text.split('\n');
  const elements = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block (including apex-action blocks — show as collapsed)
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim();
      const codeLines = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      // Skip apex-action blocks in rendered output (they're shown as ActionSteps)
      if (lang !== 'apex-action') {
        elements.push(
          <div key={key++} className="md-code-block">
            {lang && <span className="md-code-lang">{lang}</span>}
            <pre><code>{codeLines.join('\n')}</code></pre>
          </div>
        );
      }
      i++;
      continue;
    }

    // Heading
    const headingMatch = line.match(/^(#{1,3})\s+(.*)/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const Tag = `h${level + 2}`;
      elements.push(<Tag key={key++} className="md-heading">{inlineFormat(headingMatch[2])}</Tag>);
      i++;
      continue;
    }

    // Unordered list
    const listMatch = line.match(/^[-*]\s+(.*)/);
    if (listMatch) {
      const items = [];
      while (i < lines.length && lines[i].match(/^[-*]\s+(.*)/)) {
        items.push(lines[i].match(/^[-*]\s+(.*)/)[1]);
        i++;
      }
      elements.push(
        <ul key={key++} className="md-list">
          {items.map((item, j) => <li key={j}>{inlineFormat(item)}</li>)}
        </ul>
      );
      continue;
    }

    // Numbered list
    const numListMatch = line.match(/^\d+\.\s+(.*)/);
    if (numListMatch) {
      const items = [];
      while (i < lines.length && lines[i].match(/^\d+\.\s+(.*)/)) {
        items.push(lines[i].match(/^\d+\.\s+(.*)/)[1]);
        i++;
      }
      elements.push(
        <ol key={key++} className="md-list">
          {items.map((item, j) => <li key={j}>{inlineFormat(item)}</li>)}
        </ol>
      );
      continue;
    }

    // Blank line
    if (line.trim() === '') {
      elements.push(<div key={key++} className="md-spacer" />);
      i++;
      continue;
    }

    elements.push(<p key={key++} className="md-para">{inlineFormat(line)}</p>);
    i++;
  }

  return elements;
}

function inlineFormat(text) {
  const parts = [];
  const regex = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  let match;
  let k = 0;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) parts.push(<span key={k++}>{text.slice(last, match.index)}</span>);
    const token = match[0];
    if (token.startsWith('**')) {
      parts.push(<strong key={k++}>{token.slice(2, -2)}</strong>);
    } else {
      parts.push(<code key={k++} className="md-inline-code">{token.slice(1, -1)}</code>);
    }
    last = match.index + token.length;
  }
  if (last < text.length) parts.push(<span key={k++}>{text.slice(last)}</span>);
  return parts.length ? parts : text;
}

const ACTION_ICONS = {
  read_file:     '📂',
  edit_file:     '✏️',
  create_branch: '🌿',
  run_local:     '⚡',
  run_vps:       '🖥️',
  list_files:    '📋',
  git_diff:      '🔍',
  parse_error:   '⚠️',
};

function ActionSteps({ actions }) {
  if (!actions || actions.length === 0) return null;
  return (
    <div className="action-steps">
      {actions.map((a, i) => {
        const icon = ACTION_ICONS[a.type] || '🔧';
        const isErr = !!(a.result?.error || a.type === 'parse_error');
        let label = `${icon} ${a.type}`;
        if (a.type === 'edit_file')     label = `${icon} Edited \`${a.params?.path}\` on \`${a.params?.branch || 'branch'}\``;
        if (a.type === 'read_file')     label = `${icon} Read \`${a.params?.path}\``;
        if (a.type === 'create_branch') label = `${icon} Created branch \`${a.params?.branch}\``;
        if (a.type === 'run_local')     label = `${icon} Local: \`${(a.params?.command || '').slice(0, 60)}\``;
        if (a.type === 'run_vps')       label = `${icon} VPS: \`${(a.params?.command || '').slice(0, 60)}\``;
        if (a.type === 'list_files')    label = `${icon} Listed \`${a.params?.path || '/'}\``;
        if (a.type === 'git_diff')      label = `${icon} Diff \`${a.params?.base}\`→\`${a.params?.head || 'HEAD'}\``;

        const cmdOutput = (a.type === 'run_local' || a.type === 'run_vps') && !isErr
          ? (a.result?.stdout || a.result?.stderr || '').slice(0, 400)
          : null;

        return (
          <div key={i} className={`action-step ${isErr ? 'action-step-err' : 'action-step-ok'}`}>
            <span className="action-step-label">{label}</span>
            {isErr && <span className="action-step-detail">{a.result?.error || a.error}</span>}
            {cmdOutput && <pre className="action-step-output">{cmdOutput}{(a.result?.stdout?.length > 400) ? '…' : ''}</pre>}
          </div>
        );
      })}
    </div>
  );
}

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
            {msg.role === 'assistant' ? (
              <>
                <ActionSteps actions={msg.actions} />
                <div className="message-md">{renderMarkdown(msg.content)}</div>
              </>
            ) : (
              <pre className="message-text">{msg.content}</pre>
            )}
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
