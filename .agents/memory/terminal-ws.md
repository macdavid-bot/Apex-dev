---
name: Real-time Terminal (WebSocket)
description: WebSocket PTY using child_process.spawn (not node-pty) for reliability; xterm.js frontend
---

## Architecture
- WebSocket server: `ws.Server` attached to HTTP server via `server.on('upgrade')` at path `/ws/terminal`
- Auth: token in `?token=` query param (verified with `verifyToken` from services/auth/jwt.js)
- Shell: `child_process.spawn(shell, [], { stdio: 'pipe' })` — no native node-pty dependency
- stdin: WS messages of type `{ type: 'input', data: string }` → written to proc.stdin
- stdout/stderr: → WS messages `{ type: 'output', data: string }`
- Disconnect: SIGTERM → 2s wait → SIGKILL
- Frontend: xterm.js `Terminal` + `FitAddon` + `WebLinksAddon`; ResizeObserver calls `fitAddon.fit()`
- WS URL: `ws://${hostname}:3000/ws/terminal?token=...&sessionId=...`

**Note:** `spawn` doesn't support PTY features (window resize, interactive programs like vim). For full PTY, would need node-pty (native build). Current implementation handles all common use cases (streaming builds, logs, commands).

**Why:** node-pty requires native C++ compilation and is fragile in monorepo environments. spawn is guaranteed to work.
