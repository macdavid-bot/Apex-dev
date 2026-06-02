---
name: Terminal Stability
description: Fixes for the WebSocket terminal disconnecting/reconnecting loop
---

## Root Causes
1. `spawn(shell, [])` without `-i` causes bash to exit immediately in some environments (non-interactive shell exits without a prompt)
2. `term.onData(...)` stacked up on every reconnect because disposable was never called
3. No server-side keepalive caused idle connections to drop
4. Frontend reconnected at fixed 3s with no limit → infinite loop visible to user

## Backend Fix (ws/terminal.js)
- Spawn with `spawn(shell, ['-i'], {...})` — `-i` forces interactive mode
- `setInterval(() => send('ping', {}), 20_000)` — keepalive every 20s
- Clear interval on ws `close` and `error`
- Added `restart` message type so client can request new shell after exit without reconnecting WS

## Frontend Fix (TerminalPanel.jsx)
- `dataDisposable.current` ref stores xterm `onData` return value
- Call `dataDisposable.current?.dispose()` before binding new listener
- `reconnectCount` ref + `MAX_RECONNECT_ATTEMPTS = 8`
- Exponential backoff: `min(2000 * 1.5^n, 20000)` ms
- `manualClose` ref prevents auto-reconnect on deliberate close (mode switch, unmount)
- Explicit "Reconnect" button resets counter and triggers immediate reconnect
- Server `ping` → client sends `pong` to maintain session

**Why:** The stacking onData + no backoff + non-interactive shell created an infinite loop that was completely unusable.
