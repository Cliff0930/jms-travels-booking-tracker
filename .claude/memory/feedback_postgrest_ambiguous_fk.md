---
name: PostgREST ambiguous FK join — must use !column_id hint
description: When a table has two FK columns pointing to the same referenced table, PostgREST returns 500 on unqualified joins
type: feedback
originSessionId: 468b3f75-19dd-4364-a759-f8532bdb631d
---
If a Supabase table has two foreign key columns that both reference the same table (e.g. `company_id` and `guest_of_company_id` both referencing `companies`), PostgREST cannot resolve an unqualified join like `company:companies(id, name)` and returns HTTP 500.

**Fix:** Always use the `!column_name` disambiguation hint:
```js
.select('*, company:companies!company_id(id, name), guest_of_company:companies!guest_of_company_id(id, name)')
```

**Why:** This caused the entire clients API to return 500 (breaking the clients page) immediately after adding `guest_of_company_id` to the clients table (2026-05-07). The error was silent — no clear Supabase error message in the UI.

**How to apply:**
- Whenever adding a second FK column that references a table already referenced by an existing FK column, immediately update all PostgREST `.select()` calls that join that referenced table to add `!column_id` hints
- Both the original join AND the new join need the hint — the original one breaks too
