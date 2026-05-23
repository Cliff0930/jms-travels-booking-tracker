---
name: feedback_middleware_public_paths
description: Next.js middleware is in src/proxy.ts (not middleware.ts) — public paths must be explicitly listed or unauthenticated users get redirected to login
metadata: 
  node_type: memory
  type: feedback
  originSessionId: a592e0e4-0bd9-4dd2-861e-b599e4cb7f54
---

The active Next.js middleware is `src/proxy.ts` (not `middleware.ts` — this project uses a non-standard name that Next.js/Turbopack still picks up). It redirects all unauthenticated requests to `/login` unless the path is explicitly listed as public.

Current public paths:
- `/login` (auth page)
- `/api/` (all API routes)
- `/driver-status` (driver status update page)
- `/r/` (short-link redirects) ← added 2026-05-15

**Why:** `/r/[code]` short-link redirects were missing from the public list, causing drivers and approvers to hit the login wall when clicking WhatsApp/email links. Fix: add to `isPublicPath` check in `src/proxy.ts`.

**How to apply:** Any new public-facing page or route handler (e.g. a public booking confirmation page) must be added to `isPublicPath` in `src/proxy.ts`, otherwise unauthenticated external users will be blocked.
