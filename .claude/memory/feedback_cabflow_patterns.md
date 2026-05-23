---
name: CabFlow coding patterns and fixes
description: Known gotchas, required patterns, and confirmed fixes specific to the CabFlow codebase
type: feedback
originSessionId: 1d5f5ff7-1c15-44ed-b3dc-6fa30a3b4016
---
## shadcn base-ui patterns (MUST follow)

**Rule:** Never use `asChild` on Button or DropdownMenuTrigger — it is not supported in this shadcn variant.

**Why:** This project uses `@base-ui/react` (new shadcn), not Radix UI. `asChild` prop does not exist.

**How to apply:**
- For link-buttons: use `ButtonLink` from `src/components/ui/button-link.tsx`
- For dropdown items that navigate: use `onClick={() => router.push(...)}` with `useRouter`

---

## Select onValueChange null guard (MUST follow)

**Rule:** Always guard Select `onValueChange` with `v !== null &&` before calling setState.

**Why:** base-ui Select passes `string | null` (null when deselected), which breaks typed state setters expecting `string`.

**How to apply:** `onValueChange={v => v !== null && setField('key', v)}`

---

## No react-hook-form + Zod coerce on forms with number fields

**Rule:** Use plain `useState` form state instead of react-hook-form + zodResolver when the schema uses `z.coerce.number()`.

**Why:** Zod v4 `z.coerce.number()` causes TypeScript resolver type mismatch with `@hookform/resolvers/zod`.

**How to apply:** Drivers page and new booking page already use plain useState. Follow same pattern for any new form with numeric fields.

---

## Supabase bypass pattern

**Rule:** Always check `supabaseConfigured` flag before any Supabase operation in server components / proxy.

**Why:** `.env.local` has placeholder values during development. Without the guard, the app crashes with "Invalid supabaseUrl".

**How to apply:** See `src/proxy.ts` and `src/app/(dashboard)/layout.tsx` for the pattern — check URL is non-empty, not the placeholder string, and starts with `http`.

---

## Next.js 16 — middleware.ts is now proxy.ts

**Rule:** In this project (Next.js 16.2.4), the middleware file is `src/proxy.ts` and the exported function must be named `proxy` (not `middleware`).

**Why:** Next.js 16 renamed the middleware convention. The old `middleware` export name causes a build error: "Proxy is missing expected function export name".

**How to apply:** If you ever recreate or edit the proxy file, ensure `export async function proxy(request: NextRequest)` — not `middleware`.

---

## Supabase query builder — no .catch(), use .then(()=>{},()=>{})

**Rule:** Never use `.catch()` on a Supabase `PostgrestFilterBuilder` chain. Use `.then(() => {}, () => {})` for fire-and-forget error suppression.

**Why:** `PostgrestFilterBuilder` does not expose a `.catch()` method — TypeScript build fails with "Property 'catch' does not exist". This broke two consecutive Vercel deploys on 2026-05-14 (commits e5aebc4 and d347009 both failed to build).

**How to apply:**
```typescript
// WRONG — build error
void supabase.from('table').update({...}).eq('id', id).catch(() => {})

// CORRECT
void supabase.from('table').update({...}).eq('id', id).then(() => {}, () => {})
```

---

## Supabase table grants — required when "Auto expose" is disabled

**Rule:** Always include GRANT statements at the end of `supabase-schema.sql` when the Supabase project was created with "Automatically expose new tables" turned OFF.

**Why:** Without grants, even the `service_role` JWT gets "permission denied for table X" from PostgREST. This was hit in production setup on 2026-04-29.

**How to apply:** The grants are already appended to `supabase-schema.sql`. If rebuilding the DB, run the full schema including the GRANT block at the bottom.
