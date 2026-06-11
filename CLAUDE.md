@AGENTS.md

# CabFlow — Project Context for Claude

## What this is
Full-stack PWA for JMS Travels (Bengaluru cab service, ~50 bookings/day, 90% corporate).
Replaces manual WhatsApp/Gmail booking intake with AI automation.
Built with: Next.js 16.2.4 + shadcn/ui (base-ui variant) + Supabase + Gemini 2.5 Flash + Meta WhatsApp API + Gmail API + TanStack Query + Tailwind v4

---

## Deployment
- **Production:** https://booking.jmstravels.net
- **GitHub:** https://github.com/Cliff0930/jms-travels-booking-tracker (account: Cliff0930)
- **Vercel:** team `jmstravelprabhu-1531`, project `prj_SKLAP3Anio26Ajis7MqDyUe1r0sY`, team `team_072mzg5tYyji5C8yBs3k5I7l`
- **Deploy method:** Push to GitHub main → auto-deploys. NEVER use Vercel CLI.
- **Vercel plan:** Pro ($20/month)

---

## shadcn/ui — Critical Breaking Patterns
This project uses the newer `@base-ui/react` variant — NOT the standard shadcn:
- `Button` does NOT support `asChild` — use `ButtonLink` at `src/components/ui/button-link.tsx` instead
- `Select` `onValueChange` receives `string | null` — always guard with `v !== null` before using
- `DropdownMenuTrigger` does not support `asChild`
- `Dialog` has `sm:max-w-sm` hardcoded — must use `sm:max-w-*` prefix to override width

---

## Supabase Rules (critical — every new table)
All 4 steps required or PostgREST will throw permission errors:
```sql
GRANT ALL ON <table> TO postgres, anon, authenticated, service_role;
ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON <table> FOR ALL TO service_role USING (true) WITH CHECK (true);
NOTIFY pgrst, 'reload schema';
```
- All app data access uses `createAdminClient()` (service_role key) — bypasses RLS
- Never use the anon key for data access
- Migrations run in Supabase SQL Editor (pg_dump blocked — IPv6 only connection)

---

## WhatsApp Templates (Meta-approved)
| Template name | Params | Used for |
|---|---|---|
| `jms_trip_brief_driver` | 12: driverName, ref, company, guestName, guestPhone, pickup, drop, date, time, pax, arrivedLink, completedLink | Initial booking assignment + booking-level substitute driver |
| `jms_substitute_client` | 7: clientName, ref, driverName, driverPhone, vehicleName, vehicleColor, plateNumber | Client notified of driver change (no pickup/drop) |
| `jms_leg_day_links` | 5: dayNumber, ref, legDate, arrivedLink, completedLink | Same driver — send day-specific links per leg |
| `jms_leg_driver_brief` | 9: driverName, ref, company, guestName, guestPhone, legDate, pax, arrivedLink, completedLink | Different driver assigned to a specific leg (no pickup/drop/time) |

**Key rule:** Driver messages always use `sendWhatsAppTemplate` (reliable). Client messages use `sendWhatsAppSmart` (free-form if 24h window open, else template).
App drivers (uses_app=true, last_app_seen < 7 days): skip WhatsApp, log as skipped.

---

## Key Architecture Decisions
- **Middleware:** `src/proxy.ts` (NOT middleware.ts) — add new public routes to `isPublicPath`
- **Gmail auth:** Service account + domain-wide delegation, impersonates `bookings@jmstravels.net`. NOT OAuth.
- **Short links:** All driver/approval links sent as `https://booking.jmstravels.net/r/xxxxxx` — no time expiry, expire only on use/cancel
- **Booking refs:** Format `BK-YYYY-XXXX`, counter in `booking_counters` table
- **booking_type:** Valid values are `'company'` and `'personal'` ONLY — `'corporate'` is invalid
- **Driver status:** Must be updated on all 4 paths: assign, substitute, cancel, complete
- **Bata:** Computed server-side; `bata_driver` column on `trip_sheets`; company rate overrides driver default by vehicle_name
- **Silent driver assignment:** `silent: true` in assign POST body skips all WhatsApp/push/email — used for backdating completed trips
- **Smart driver link redirect:** `GET /api/driver-redirect-check` called on every driver-status page load (client-side useEffect). Redirects to correct link based on driver's active trips. Skipped for app drivers and leg-specific links. Falls back to original form on any error (4s timeout). Future-dated trips/legs show "not yet due" message instead of form.

---

## Multi-leg Booking Flow
- `total_days > 1` creates N `booking_legs` rows
- Each leg has: `day_number`, `leg_date`, `driver_id` (can differ per leg), `leg_status`, `link_sent_at`
- **Same driver on all legs:** Operator taps "Send Day X Links" per leg → `jms_leg_day_links` template
- **Different driver on a leg:** Assign via TripLegsPanel dropdown → `PATCH /api/bookings/[id]/legs/[legId]` auto-fires `jms_leg_driver_brief` to driver + `jms_substitute_client` to client

---

## Driver App
- React Native / Expo, separate repo in same GitHub
- Node v20 REQUIRED for OTA: `PATH="/Users/sami/.nvm/versions/node/v20.20.2/bin:$PATH" eas update --channel preview --non-interactive`
- Always push OTA immediately after driver-app git push
- APK build: EAS (not local)

---

## Messages Inbox (`/messages`)
Two-panel WhatsApp-web-style inbox. Three channel tabs: WhatsApp · Email · Drivers.

**raw_messages identifiers — critical:**
- WhatsApp inbound: `sender_phone` set, `sender_email` NULL
- Email inbound: `sender_email` set, `sender_phone` NULL
- Never query email contacts by `sender_phone` — they'll all be null
- Thread API: `phone.includes('@')` → filter by `sender_email`; else `sender_phone`
- Client name lookup: email tab → `primary_email`, WhatsApp tab → `primary_phone`
- Client thread with both: `.or('sender_phone.eq.X,sender_email.eq.Y')`

**Mobile height calc:**
- Outer div: `h-[calc(100dvh-11rem)]` mobile, `h-[calc(100dvh-8rem)]` desktop
- 11rem = 4rem (main-layout padding-top) + 1rem (p-4 top) + 5rem (main-layout padding-bottom) + 1rem (p-4 bottom)

**message_logs content:** `sendWhatsAppTemplate` stores `fallbackBody` (not raw params) — all callers must pass `fallbackBody` for readable logs.
**Junk email filter:** Email tab contacts query uses `.neq('ai_classification', 'junk')` — promotional emails are hidden; only booking/enquiry/unprocessed emails show.

**Key files:** `src/app/(dashboard)/messages/page.tsx`, `src/app/api/messages/contacts/route.ts`, `src/app/api/messages/route.ts`

---

## Key API Routes
| Route | Purpose |
|---|---|
| `POST /api/bookings/[id]/assign` | Assign driver to booking — sends trip brief + client driver details |
| `POST /api/bookings/[id]/substitute` | Swap booking-level driver |
| `PATCH /api/bookings/[id]/legs/[legId]` | Assign driver to specific leg — auto-sends notifications |
| `POST /api/bookings/[id]/legs/[legId]/send-links` | Send day-specific links to same driver |
| `GET /api/driver-redirect-check` | Smart redirect check — returns correct link for driver's current state |
| `POST /api/driver-status` | Driver arrived/completed form handler |
| `POST /api/webhooks/whatsapp` | Incoming WhatsApp handler |
| `POST /api/webhooks/gmail` | Incoming Gmail handler |
| `GET /api/messages/contacts` | Contact list for inbox (tab=whatsapp\|email\|driver) |
| `GET /api/messages` | Thread messages (phone=, client_id=, or driver_id=) |

---

## Dashboard — Driver Action Required
`DriverAlertRow` in `src/app/(dashboard)/page.tsx` shows company name + driver name + plate on all screen sizes (no `hidden sm:block`). The `booking.company` field is already included in `useBookings` API response — no API changes needed to add new fields here.

---

## Coding Rules
- **Before ANY code edit:** (1) explain what you're changing and why, (2) show a before/after example or describe the UI change, (3) ask for approval, (4) wait for "go ahead" — only then edit. No exceptions, single-line fixes included.
- No comments in code unless the WHY is non-obvious
- No new abstractions beyond what the task requires
- Date end-of-month: never use `${month}-31` — use `lt(first day of next month)`
- PostgREST two-FK ambiguity: always use `!column_id` hint on joins
- New timestamp columns: `created_at` on all tables except `raw_messages` (uses `received_at`) and `message_logs` (uses `sent_at`)
