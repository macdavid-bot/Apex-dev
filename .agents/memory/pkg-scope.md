---
name: Monorepo Package Scope
description: Services in root services/ must install packages at workspace root, not inside apps/
---

## Rule
Any package imported by files in `services/` (root level) must be installed at the **workspace root** using:
```
pnpm add -w pg jsonwebtoken bcryptjs ws cookie-parser
```
NOT inside `apps/api` or any sub-package.

## Why
- `services/` files are at workspace root; they cannot resolve packages from `apps/api/node_modules`
- Node.js ESM resolves packages by walking up from the importing file's location
- Packages installed with `pnpm add -w` go to `node_modules/` at repo root, which is always in the resolution path

## Packages currently at root level
pg, jsonwebtoken, bcryptjs, ws, cookie-parser

## Packages inside apps/api (only used there)
cors, express, node-ssh, pg (also there), jsonwebtoken (also there), bcryptjs (also there), ws (also there), cookie-parser (also there)

## Packages inside apps/web
xterm, @xterm/addon-fit, @xterm/addon-web-links, react, react-dom, etc.
