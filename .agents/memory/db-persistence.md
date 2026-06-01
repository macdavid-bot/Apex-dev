---
name: DB persistence for workflows and approvals
description: Workflows and approvals are now DB-backed async functions; activity_log table added
---

# DB Persistence — workflows, approvals, activity log

## The Rule
`services/workflow/store.js` and `services/approval/runtime.js` are now **async**. All callers (routes/workflow.js, routes/approval.js) must `await` them.

## What Changed
- `addWorkflow`, `updateWorkflow`, `getWorkflows` — all async, write to `workflows` table
- `createApproval`, `getApprovals`, `approveAction`, `rejectAction` — all async, write to `approvals` table
- New `activity_log` table in `services/db/migrations.js`
- New `services/monitoring/activity.js` — `logActivity(category, action, meta)` and `getActivityLog(opts)`, both async, DB-backed with in-memory ring buffer fallback

## Why
Workflows and approvals were previously in-memory only — lost on server restart. The DB tables already existed in migrations but weren't being used.

## How to Apply
- Any new service that needs to track state across restarts: use DB with in-memory fallback pattern (see workflow/store.js)
- `logActivity()` is the correct way to record audit events — not console.log
- `GET /system/activity` exposes the log to the frontend (protected by requireAuth)
