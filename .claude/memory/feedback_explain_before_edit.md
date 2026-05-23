---
name: feedback_explain_before_edit
description: User wants a clear explanation of what will be changed before any code edits are executed
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 2af722a1-bbe1-4cdd-bf1d-2fa04650b4e9
---

Always explain the proposed change (what file, what line, what it does) and wait for confirmation before executing any Edit or Write tool call.

**Why:** User was surprised by a code edit without prior explanation and rejected it.

**How to apply:** For every code change, describe it in plain language first — file, what's changing, and why — then wait for the user to say "go ahead" or similar before running the edit tool.
