---
name: feedback_postgrest_schema_cache
description: "After ALTER TABLE adds a new column, PostgREST .is('column', null) filters silently fail until schema cache refreshes"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 2af722a1-bbe1-4cdd-bf1d-2fa04650b4e9
---

After running `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, PostgREST's schema cache may not immediately recognize the new column. Queries that filter on the new column (especially `.is('column', null)`) silently fail — Supabase JS client returns `{ data: null, error }` which is swallowed if not checked, causing code to fall into fallback branches (e.g. inserting instead of updating).

**Why:** PostgREST caches the DB schema at startup. New columns added via ALTER TABLE aren't visible until the cache is reloaded. This caused the driver-status "completed" route to fail to find the arrive trip_sheet row (`.is('booking_leg_id', null)` filter returned error), insert a new row instead, and that insert also failed silently. The web form showed a summary (from React state) making it appear successful.

**How to apply:**
- After ANY `ALTER TABLE ... ADD COLUMN`, always run in Supabase SQL editor: `NOTIFY pgrst, 'reload schema';`
- For completion/lookup queries that don't strictly need to filter on a newly-added nullable column, prefer NOT filtering on it — e.g. use `.order('created_at', { ascending: false }).limit(1)` to get the most recent row rather than `.is('new_column', null)`
- Always use `.maybeSingle()` not `.single()` for optional lookups — `.single()` errors on 0 rows and the error is easily swallowed
- Add `console.error` logging to ALL Supabase insert/update/delete operations so silent failures are visible in Vercel logs

**Related:** [[feedback_supabase_grants]] — same pattern of silent failures from DB-level issues
