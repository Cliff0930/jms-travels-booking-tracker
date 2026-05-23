---
name: Timestamp column names per table
description: raw_messages and message_logs use non-standard timestamp column names — causes SQL errors if assumed to be created_at
type: feedback
originSessionId: 87eec102-3372-476e-b143-1f8bc35cbe8e
---
Not all tables use `created_at`. When writing SQL for CabFlow:

- `raw_messages` → timestamp column is `received_at`
- `message_logs` → timestamp column is `sent_at`
- All other tables (bookings, clients, companies, drivers, conversation_sessions, booking_status_history, booking_edit_logs, etc.) → `created_at`

**Why:** Caused repeated SQL query failures when trying to filter today's records for the 2026-05-11 data wipe.

**How to apply:** Always check these two tables specifically when writing date-range queries.
