---
name: Streaming & Background Jobs
description: POST /orchestrator/chat enqueues AI tasks; SSE streams live tokens back; jobs survive disconnects
---

## Flow
1. `POST /orchestrator/chat` (requireAuth) → enqueues job in `job_queue` DB table → returns `{ jobId, conversationId }` immediately
2. Frontend connects to `GET /jobs/:id/stream` via EventSource — SSE stream of live events
3. Worker (`services/queue/worker.js`) polls `job_queue` every 2 seconds, claims next pending job (`FOR UPDATE SKIP LOCKED`), runs `runAiJob`
4. `runAiJob` uses `runDeepSeekStream` (async generator) to stream tokens; emits `token`/`action`/`progress`/`done`/`error` events via `jobEvents` EventEmitter
5. SSE route listens to `jobEvents` and forwards to client
6. Job result is saved in `result_json` column — frontend can re-fetch at any time even after disconnect

## Key files
- `services/queue/store.js` — enqueue/claimNext/complete/fail (DB-backed + in-memory fallback)
- `services/queue/worker.js` — exports `jobEvents` EventEmitter + `startWorker(intervalMs)`
- `apps/api/src/routes/jobs.js` — SSE stream endpoint, requires `?token=` for EventSource auth
- `services/ai/deepseek-runtime.js` — `runDeepSeekStream` async generator

**Why:** Tasks must survive client disconnects (user closes browser, server keeps working).
**How to apply:** All AI tasks go through enqueue → worker. Direct blocking calls only for simple non-AI tasks.
