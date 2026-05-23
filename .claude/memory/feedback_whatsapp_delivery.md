---
name: feedback-whatsapp-delivery
description: "WhatsApp delivery fixes — templates required, phone normalization, resend route"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 11d80bd9-3fda-41ed-8ee3-4ecaf20dbe85
---

All outbound WhatsApp routes must use `sendWhatsAppTemplate()` not `sendWhatsAppMessage()`. Free-form text silently fails outside the 24-hour conversation window (Meta returns 200 + wamid but never delivers). Utility templates bypass this window.

**Why:** Silent delivery failures were traced to the 24h session window. Meta returns HTTP 200 with a message ID even for dropped messages, so logs showed "sent" but recipients got nothing.

**How to apply:**
- Any new outbound notification route must use `sendWhatsAppTemplate` with a registered Meta template
- The `sendWhatsAppMessage` function is only valid for conversational replies to inbound messages (within 24h window) — e.g., webhook handler AI replies
- `fallbackBody` parameter handles cases where the template isn't approved yet

**Phone number normalization (fixed 2026-05-20):**
- Indian numbers stored without country code (e.g. `7619219969`) caused 131047 delivery failures
- Fixed in `src/lib/whatsapp/send.ts` — `normalizePhone()` auto-prepends `91` for 10-digit numbers starting with 6-9
- Always store phone numbers WITH country code in DB. Run `UPDATE drivers SET phone = '91' || phone WHERE phone ~ '^[6-9][0-9]{9}$'` if bare numbers exist

**DB column:** `message_logs.whatsapp_message_id` must exist — was missing from live DB. Add with `ALTER TABLE message_logs ADD COLUMN IF NOT EXISTS whatsapp_message_id text;`

**Delivery status tracking:** Webhook at `src/app/api/webhooks/whatsapp/route.ts` processes `statuses` array and updates `message_logs.status` to `delivered` or `failed` based on Meta callbacks.
