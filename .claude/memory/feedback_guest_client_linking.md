---
name: feedback_guest_client_linking
description: "When creating a guest client record, always capture the returned ID and update the booking's guest_client_id — missing this link is a recurring bug."
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 11d80bd9-3fda-41ed-8ee3-4ecaf20dbe85
---

After inserting a guest client, always use `.select('id').single()` to capture the new ID, then `UPDATE bookings SET guest_client_id = <id>`.

**Why:** The `bookings` table has a `guest_client_id` FK column (added via migration — not in supabase-schema.sql). If you call `.insert({...})` without selecting the returned row, the guest profile is created but the booking stays unlinked. This happened in `parse-message/route.ts` (email intake) while WhatsApp webhook already did it correctly. Fixed 2026-05-20.

**How to apply:** Any time guest client creation or lookup happens in any intake route, check that:
1. `.insert(...).select('id').single()` is used (not bare `.insert(...)`)
2. Existing guest lookup captures `.id` from the result
3. `await supabase.from('bookings').update({ guest_client_id }).eq('id', booking.id)` is called if `guest_client_id` is non-null

Key files that handle this correctly: `src/app/api/webhooks/whatsapp/route.ts` (line ~857), `src/app/api/ai/parse-message/route.ts` (fixed 2026-05-20), `src/app/api/bookings/[id]/edit/route.ts`.
