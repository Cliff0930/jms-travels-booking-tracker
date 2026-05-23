---
name: feedback_gmail_service_account
description: Gmail now uses service account with domain-wide delegation — NOT OAuth refresh tokens. OAuth was blocked by Google Workspace restrictions on bookings@jmstravels.net.
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 11d80bd9-3fda-41ed-8ee3-4ecaf20dbe85
---

Gmail auth switched to service account + domain-wide delegation (2026-05-20).

**Why:** bookings@jmstravels.net is a Google Workspace account. The OAuth client (`268246654734-gk94...` in "JMS Travels - automation" project owned by bookings@jmstravels.net) returned `unauthorized_client` for ALL refresh tokens with send/mail scopes. Root cause: Workspace API restrictions block OAuth token refresh for external clients — even tokens obtained by jmstravelprabhu@gmail.com failed.

**Current setup:**
- Service account: `jms-travels-booking-tracker@jms-travels-booking-tracker.iam.gserviceaccount.com` (in "JMS Travels Booking Tracker" project, owned by jmstravelprabhu@gmail.com)
- Domain-wide delegation granted in Google Workspace Admin Console → Security → API controls → Domain-wide delegation
- Client ID used: `105570569737914776845`
- Scopes granted: `gmail.send`, `gmail.readonly`
- Subject (impersonated user): `bookings@jmstravels.net`
- Key stored in: `GOOGLE_SERVICE_ACCOUNT_KEY` env var (base64 JSON, same key as before)
- GMAIL_USER_EMAIL still `bookings@jmstravels.net` (used as From address)

**Files updated:**
- `src/lib/gmail/send.ts` — `getGmailAuth()` uses `google.auth.JWT` with service account
- `src/app/api/webhooks/gmail/route.ts` — same
- `src/app/api/cron/renew-gmail-watch/route.ts` — same

**How to apply:** Never go back to OAuth refresh tokens for Gmail. If Gmail breaks, check that domain-wide delegation is still active in admin.google.com. The service account key never expires.

**Also removed:** Drive backup cron + archive routes (user switching to Supabase paid plan). Removed `GOOGLE_DRIVE_*` env vars.
