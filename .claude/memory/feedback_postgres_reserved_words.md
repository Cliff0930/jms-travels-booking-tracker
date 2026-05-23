---
name: PostgreSQL reserved word quoting
description: Column named 'role' causes syntax error in ON CONFLICT DO UPDATE — must be double-quoted
type: feedback
originSessionId: dbeb67e1-2a63-46e5-96ed-97a96d3924d8
---
In `ON CONFLICT ... DO UPDATE SET`, column names that are PostgreSQL reserved words must be double-quoted.

**Why:** `role` is a reserved keyword in PostgreSQL. Using it unquoted in `UPDATE SET role = ...` throws `syntax error at or near "admin"` (misleading — the real error is the unquoted reserved word before it).

**How to apply:** Any time writing SQL with `ON CONFLICT DO UPDATE SET` on a column named `role`, `user`, `name`, `value`, `type`, or other reserved words — always double-quote: `"role" = 'admin'`. Same applies to `CREATE TABLE` column definitions if using reserved words (though Supabase handles those more gracefully).

Correct pattern:
```sql
ON CONFLICT (id) DO UPDATE SET "role" = 'admin';
```
