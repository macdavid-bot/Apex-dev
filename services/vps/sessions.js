// Shared in-memory VPS session store — imported by both vps.js route and orchestrator.
// Sessions hold SSH credentials in memory only; nothing is persisted to disk.
export const sessions = new Map();
