---
name: Gmail webhook CC loop prevention
description: Patterns to prevent email feedback loops and duplicate processing in the Gmail webhook
type: feedback
originSessionId: 87eec102-3372-476e-b143-1f8bc35cbe8e
---
Never forward the full CC list from an inbound email back to outgoing replies without stripping the JMS own address (`bookings@jmstravels.net` / `GMAIL_USER_EMAIL`). If the own address is in CC, the sent reply lands back in the JMS inbox as a new message, the Gmail webhook reprocesses it as a booking, sends another reply — infinite loop.

**Why:** Caused a catastrophic incident on 2026-05-11 — 802 duplicate bookings, 2302 raw_messages in minutes.

**How to apply:**
- In `src/app/api/webhooks/gmail/route.ts`, the CC strip is already implemented — when editing this file, never remove the `ownEmail` filter on `ccEmails`
- The self-email skip (`senderEmail === ownEmail → continue`) must also stay in place
- The historyId upsert must stay BEFORE the `history.list` call — not after — to prevent second webhook (triggered by our own outgoing email advancing Gmail history) from reprocessing the same inbox message
