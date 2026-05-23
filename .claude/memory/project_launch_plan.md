---
name: CabFlow launch plan
description: Current site is being used as a test environment; data will be wiped and restarted fresh once everything is working
type: project
originSessionId: f58e4bc2-8b23-497b-8540-af8d8e3953ec
---
Current deployment (booking.jmstravels.net) is being treated as a test/staging environment. Once all bugs are resolved and the system is stable, all data will be deleted and the site will be relaunched fresh with real production data.

**Why:** Easier to test live WhatsApp flows with real interactions rather than building a separate test mode. Any data created during testing is throwaway.

**How to apply:** Don't worry about test data polluting production — it's all intentional. When user asks to "reset" or "wipe data", they mean a full clean slate before real launch. Write the truncate SQL in FK-safe order when asked.

Tables to clear at reset: bookings, clients, companies, drivers, conversation_sessions, raw_messages, message_logs, booking_status_history, booking_edit_logs, booking_legs, client_contacts, client_locations.
Tables to potentially keep: driver records, company config (if manually set up and worth carrying over).
