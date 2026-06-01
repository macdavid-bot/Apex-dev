---
name: Auth bcrypt security
description: How password comparison works in auth.js — bcrypt, activity logging, and plain-text env var handling
---

# Auth Security — bcrypt + activity logging

## The Rule
`auth.js` uses `bcryptjs` for password comparison. Never revert to plain string comparison.

## How It Works
- `AUTH_PASSWORD` env var can be either a plain-text password OR a pre-hashed bcrypt string (starts with `$2`)
- On first login attempt, the password is hashed in-memory with `bcrypt.hash(raw, 10)` and cached in `_hashedPassword`
- Comparison uses `bcrypt.compare(inputPassword, hash)` — timing-safe
- All login attempts (success + failure), logouts, and login errors are logged to `activity_log` via `logActivity()`

## Why
Plain-text string comparison is vulnerable to timing attacks. The previous code did `password !== PASSWORD` which could leak information. Found during security audit.

## How to Apply
- If adding other authentication paths (e.g., API key auth), always use timing-safe comparison
- `AUTH_PASSWORD` can be set to a pre-computed bcrypt hash for extra security: `htpasswd -bnBC 10 "" password | tr -d ':\n'`
- `bcryptjs` is installed at workspace root (`pnpm add -w bcryptjs`)
