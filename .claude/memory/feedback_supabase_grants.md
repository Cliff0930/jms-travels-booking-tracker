---
name: Supabase new table GRANT requirement
description: Every new Supabase table needs an explicit GRANT or PostgREST silently blocks all access
type: feedback
originSessionId: 3b2dc7af-22bd-4779-8fdc-b7a9537fdf3f
---
Every time a new table is added to this Supabase project via SQL migration, always include:

```sql
GRANT ALL ON <table_name> TO postgres, anon, authenticated, service_role;
```

**Why:** This project was created with "Automatically expose new tables" turned OFF. Without the GRANT, PostgREST blocks all access to the table even with the service_role key. The failure is completely SILENT — Supabase client returns `null` instead of throwing, so code silently skips processing with no error logged. This caused the entire WhatsApp conversation flow to stop working (2026-05-01) because `conversation_sessions` was added without a GRANT.

**How to apply:**
- Always append `GRANT ALL ON <table> TO postgres, anon, authenticated, service_role;` immediately after the `CREATE TABLE` in `supabase-schema.sql`
- When telling the user to run a migration SQL in Supabase dashboard, always include the GRANT in the same block
- If WhatsApp or any feature silently stops working with no errors, check if a new table is missing its GRANT
