---
name: feedback_email_signature
description: Email signature lives in src/lib/gmail/send.ts DEFAULT_SIGNATURE — no UI editor exists; database key email_signature overrides if set
metadata: 
  node_type: memory
  type: feedback
  originSessionId: a592e0e4-0bd9-4dd2-861e-b599e4cb7f54
---

The outgoing email signature is defined as `DEFAULT_SIGNATURE` in `src/lib/gmail/send.ts`. The `getSignature()` function first checks `app_settings.email_signature` in the database; if not set, it falls back to `DEFAULT_SIGNATURE`.

Current signature (as of 2026-05-15):
```
Best regards,

JMS Travels
Phone: 9845572207
bookings@jmstravels.net
```

**Why:** There is no settings UI for the signature — the settings page has no signature field. So all signature changes must be made directly in `src/lib/gmail/send.ts`.

**How to apply:** When asked to change the signature, edit `DEFAULT_SIGNATURE` in `src/lib/gmail/send.ts`. If a database override exists, it will take precedence and the code change won't take effect — but this is unlikely since there's no UI to set it.
