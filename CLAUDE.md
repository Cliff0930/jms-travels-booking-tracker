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
- **Driver search:** `DriverSearchCombobox` at `src/components/shared/DriverSearchCombobox.tsx` — searchable by name, plate (spaces stripped for matching), or phone. Used in TripLegsPanel. Same open/close/outside-click pattern as `CompanyCombobox`.
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
| `jms_leg_removed_driver` | 4: driverName, dayNumber, bookingRef, legDate | Old leg driver notified when replaced on a specific leg — **pending Meta approval** (free-form via `sendWhatsAppSmart` until approved) |
| `jms_leg_driver_update_client` | 7: clientName, ref, dayNumber, legDate, driverName, driverPhone, vehicle | Per-leg client notification when outside 24h WA window — **pending Meta approval** |

**Key rule:** Driver messages always use `sendWhatsAppTemplate` (reliable). Client messages use `sendWhatsAppSmart` (free-form if 24h window open, else template).
App drivers (uses_app=true, last_app_seen < 7 days): skip WhatsApp, log as skipped.

---

## Key Architecture Decisions
- **Middleware:** `src/proxy.ts` (NOT middleware.ts) — add new public routes to `isPublicPath`
- **Gmail auth:** Service account + domain-wide delegation, impersonates `bookings@jmstravels.net`. NOT OAuth.
- **Short links:** All driver/approval links sent as `https://booking.jmstravels.net/r/xxxxxx` — no time expiry, expire only on use/cancel
- **Booking refs:** Format `BK-YYYY-XXXX`, counter in `booking_counters` table
- **booking_type:** Valid values are `'company'` and `'personal'` ONLY — `'corporate'` is invalid
- **Invoice delete FK order:** `credit_notes` → `billing_payments` → `invoice_line_items` → `invoices` (no CASCADE). Counter reset: `UPDATE app_settings SET value = '0' WHERE key = 'invoice_last_seq_2026-27'`
- **Driver status:** Must be updated on all 4 paths: assign, substitute, cancel, complete
- **Bata:** Computed server-side; `bata_driver` column on `trip_sheets`; company rate overrides driver default by vehicle_name
- **Silent driver assignment:** `silent: true` in assign POST body skips all WhatsApp/push/email — used for backdating completed trips
- **Gmail email threading:** `bookings.gmail_thread_id` is already stored when a booking is created from an email (set in `parse-message` and `fill-missing`). All outbound `sendEmailSafe` calls in `confirm`, `assign`, `resend`, `substitute`, and `legs/notify-client` pass `replyToThreadId: booking.gmail_thread_id || undefined` — so all emails for email-source bookings land in the same client thread. WhatsApp/manual bookings have `null` → `undefined` → new thread (no change).
- **Outgoing emails:** `text/html` content-type. Signature is `DEFAULT_SIGNATURE` HTML table in `src/lib/gmail/send.ts`. Never restore the old `app_settings` DB lookup — it silently overrides code changes.
- **Smart driver link redirect:** `GET /api/driver-redirect-check` called on every driver-status page load (client-side useEffect). Redirects to correct link based on driver's active trips. Skipped for app drivers only. For booking-level links: redirects between in_progress/confirmed/completed trips. For leg-specific links (multi-day): redirects to the correct day's link — completed leg → next not-started leg, in-progress leg + arrived action → that leg's completed link, previous leg still in-progress → redirect there first. Falls back to original form on any error (4s timeout). Future-dated trips/legs show "not yet due" message instead of form.
- **Google Maps URLs from clients:** `pickup_location_url` / `drop_location_url` columns on `bookings` store map links sent by clients. On driver assignment (`assign/route.ts`), the URL is appended inside the `pickup`/`drop` params of `jms_trip_brief_driver` using ` | ` as separator (e.g. `"Address | Map: https://..."`). **Never use `\n` as separator** — Meta rejects newlines in template body params (error #132018). Never send as a separate free-form message — drivers may not have an open 24h window. Booking detail page and driver app both render these URLs as tappable map links.
  - **WhatsApp location pin** (`type: 'location'`): `handleLocationPin()` in `webhooks/whatsapp/route.ts` → extracts lat/lng → builds `https://www.google.com/maps?q=${lat},${lng}` → finds most recent active booking for that phone (24h window) → updates `pickup_location_url` → stores with `ai_classification: 'location_pin'` → replies confirming receipt. Always treated as pickup (no text context to detect).
  - **Text Maps URL follow-up** (in `processClientMessage`): 24h window (not 10 min). URL stored in `pickup_location_url` or `drop_location_url` separately; address text in `pickup_location` or `drop_location`. Keyword detection: `/\b(drop|destination|to\s*:|dropping|reach|arrive)\b/i` → drop fields; else pickup fields.
  - **During booking session / email parse**: `extractMapsUrls()` in `parse-message/route.ts` + `conversation/process.ts`; same keyword logic. Email replies merged in `fill-missing.ts`.
  - **Newline stripping (critical):** `booking.pickup_location` / `booking.drop_location` can contain `\n` when Gemini extracts a multi-line address block. Always `.replace(/\r?\n+/g, ' ').trim()` both fields before using them as WhatsApp template params — Meta rejects params with newlines (error #132018). All three routes now use `buildPickupParam()` from `src/lib/utils/trip-params.ts` which handles both newline stripping and multi-stop encoding. The ` | Map: ` separator rule and this newline rule are separate concerns — both are applied inside `buildPickupParam()`.

---

## Multi-Stop Pickup Trip Flow (shipped 2026-06-20)
One booking, one driver, multiple sequential pickup stops before a single final drop (e.g. "Pick Rajesh from MG Road, then Priya from Koramangala, drop both at airport").

- **Database:** `bookings.pickup_stops` — JSONB column, nullable. Schema: `[{"order":1,"location":"address","time":"HH:MM or null","guest":"name or null"}]`
- **Type:** `PickupStop` interface in `src/types/index.ts`. `Booking` interface has `pickup_stops: PickupStop[] | null`.
- **Helpers:** `src/lib/utils/trip-params.ts`
  - `buildPickupParam(location, locationUrl, stops)` — pipe-separated, no newlines, Meta-safe. Used in template `params[]` in assign/resend/substitute.
  - `buildPickupLines(location, locationUrl, stops)` — newline-separated for fallback body text only.
- **Driver template param:** `Stop 1: MG Road 09:00 Rajesh | Stop 2: Koramangala 09:20 Priya` — single string, no newlines.
- **Prompts:** MULTI-STOP PICKUP TRIPS section in all 3 Gemini prompts with ✓/✗ examples. Fires only when client explicitly names multiple collection points.
- **Safety nets (converse.ts):** Single-element `pickup_stops` → cleared. `pickup_stops` set but `pickup_location` null → derives from `stops[0].location`.
- **Booking detail page:** Numbered stop list shown between Pickup and Drop fields when `pickup_stops` has 2+ entries. Editable via pencil icon → inline editor (location+time+guest per row, add/remove rows, "Remove all stops" option). "+ Stops" button on Pickup Location header when no stops yet. `startStopsEditor()` function populates `stopsEditorDraft` state. `handleFieldSave` handles `'pickup_stops'` → saves `pickup_stops` array + `pickup_location = stops[0].location`; 0 valid stops → saves `pickup_stops: null`.
- **New booking form:** "Add multiple pickup stops" toggle link below Pickup Location field (in Section 3). Numbered rows with location+time+guest inputs; "Single pickup" button restores single input. On submit: `pickup_stops` array + `pickup_location = stops[0].location` sent to POST `/api/bookings`. State: `multiStop: boolean` + `stopsDraft: StopDraft[]`.
- **Normal bookings unaffected:** `pickup_stops = null` falls through to existing single-pickup logic in all routes.

---

## WhatsApp Bulk Coordinator Flow (shipped 2026-06-17)
When 3+ distinct guest phone numbers appear in a session (coordinator bulk pattern):
- **Auto-extract:** `extractBookingFields()` parses all trips from combined session text
- **Auto-create:** bookings with `missing_mandatory = []` created immediately; others flagged as incomplete
- **Operator notification:** single rich message (ops channel) — created list + incomplete list + raw messages
- **Coordinator ack:** single summary message (not one per booking); session deleted
- **`special_instructions` scope guard:** both EXTRACTION_PROMPT and CONVERSATION_PROMPT say "Max 200 chars, this booking only — do not include other guests' booking requests". Server hard-truncates to 500 chars in `createBookingFromResult()`.
- Key file: `src/app/api/webhooks/whatsapp/route.ts` (bulk detection + extraction block, ~lines 589-660)

---

## Multi-leg Booking Flow
- `total_days > 1` creates N `booking_legs` rows
- Each leg has: `day_number`, `leg_date`, `driver_id` (can differ per leg), `leg_status`, `link_sent_at`
- **`leg_status` IS updated by `driver-status/route.ts`** when `leg_id` is present: arrived → `in_progress`, completed → `completed`. Use `leg_status` as the per-leg source of truth. Calendar `effStatus()` and dashboard continuation entries both use real `leg_status` now.
- **`booking.status` for multi-leg trips:** When a leg completes with a `leg_id`, the handler checks `day_number` against the max non-cancelled leg. Only the last leg sets `completed`; intermediate legs set `in_progress`. Day 1 (booking-level link, no `leg_id`) still sets `completed` prematurely but self-heals when Day 2 arrived link is clicked.
- **Tripsheet tabs:** all tabs show dates (DD/MM/YY). Day 1 falls back to `booking.pickup_date` since its sheet has no `booking_leg_id`.
- **Alert indicators (all four views):** Calendar day cells, dashboard WeekDayCard tiles, bookings list BookingCard (card view), and BookingListRow (list view) all show the same alert system. Pulsing dot on day cells. Individual cards/rows: `⚠ No Driver Assigned` (red border/tint + tag) for confirmed/in-progress with no driver; `⚠ Draft — Confirm` / `⚠ Awaiting Approval` (amber border/tint + tag) for draft/pending. Dashboard BookingTile + BookingCard use `!border-l-4 !border-l-red-500/amber-500`. BookingListRow uses `bg-red-50/40` / `bg-amber-50/40` row tint + tag under traveller name (always visible, no breakpoint hiding). BookingCard border priority: needsClarification (orange) > noDriver (red) > possibleDup/isDraft (amber) > default.
- **Same driver on all legs — Day 1:** Driver already has booking-level arrived/completed links from `jms_trip_brief_driver` sent on assignment. The "Send Day X Links" button is **hidden for Day 1** in TripLegsPanel (`leg.day_number > 1` guard) to prevent conflicting duplicate links.
- **Same driver on all legs — Day 2+:** Operator taps "Send Day X Links" per leg → `jms_leg_day_links` template (with `leg_id` appended to arrived/completed URLs)
- **Duplicate tripsheet guard** (`driver-status/route.ts` arrived handler): if leg_id present, checks for existing leg tripsheet (skip) or orphan null-leg tripsheet (adopt by updating `booking_leg_id`) before inserting. Prevents duplicate rows when driver submits both booking-level and day-specific arrived links.
- **Different driver on a leg:** Assign via TripLegsPanel dropdown → `PATCH /api/bookings/[id]/legs/[legId]` auto-fires `jms_leg_driver_brief` to new driver + `jms_leg_removed_driver` to old driver (if being replaced). **Client is NOT auto-notified** — operator must manually click "Notify Client of Driver Update" button at the bottom of TripLegsPanel.
- **Old booking-level driver on substitute:** `POST /api/bookings/[id]/substitute` uses `jms_cancellation_driver` to notify the old driver being replaced.

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
**Junk filter:** Contacts query uses `.or('ai_classification.is.null,ai_classification.neq.junk')` — junk emails hidden, but NULLs included. **Never use `.neq('ai_classification','junk')`** — PostgREST excludes NULLs with neq, hiding messages that never got ai_classification set (location pins, fill-missing replies).

**Key files:** `src/app/(dashboard)/messages/page.tsx`, `src/app/api/messages/contacts/route.ts`, `src/app/api/messages/route.ts`

---

## Advances Page (`/advances`)
- Booking ref column: clickable `<Link href="/bookings/[id]">` in blue — navigates to booking detail
- Driver filter: `DriverSearchCombobox` (not a Select dropdown). `driverFilter === 'all'` ↔ `value=''` for the combobox. Fetches all drivers via `useQuery` → `/api/drivers`.
- Clear filters button: red X button appears when any filter active (driver/search/dateFrom/dateTo), resets all + `router.replace('/advances')`
- **Revoke settled entries:** `RotateCcw` icon on each settled row → `PATCH /api/driver-advances/[id]` with `{ status: 'outstanding' }` → clears `settled_via`, `settled_at`, `settlement_id` (moves back to outstanding)
- **Date picker in Settle dialog:** Date input (max=today). Left blank = defaults to today. Sends `settled_at: new Date(settleDate).toISOString()`
- `GET /api/driver-advances` supports `?type=advance|collection` filter
- `PATCH /api/driver-advances/[id]` supports `settled_at` field + `status='outstanding'` (revoke flow)

## Reimbursements Page (`/reimbursements`)
**4-tab design:** Pending | Missing Tripsheet | Settled | Active (In Progress) — **Pending is default tab**
- **Pending** — completed with tripsheet, `tripsheet_doc_received = false`. Default tab.
- **Missing Tripsheet** — completed bookings with no trip_sheets row. "Create Tripsheet" button → `TripsheetEditPopup`.
- **Settled** — `tripsheet_doc_received = true`; collapsed by default
- **Active (In Progress)** — confirmed/driver_assigned/in_progress trips; `InProgressCard` shows status badge, route, driver phone (tap-to-call), "View →" link.

**Filters:** Driver (`DriverSearchCombobox`), Company (`CompanyCombobox` with `placeholder="All companies"`), Customer (inline type-ahead → `/api/clients?q=&company_any=`, sends `client_id` to API, cascades with company), Search text, Date range, Clear All, Excel Export
- API params: `status`, `driver_id`, `company_id`, `client_id` (filters on `client_id OR guest_client_id`)
- `CompanyCombobox` has optional `placeholder` prop added (default 'No company', unchanged for other usages)

**PayRow UX:** Must toggle "Received" ON first → then "Pay Now" / "→ Settle Later" / "Reject" appear
- Pay Now → `paid=true` → **excluded from monthly settlement** (settlement generator checks `*_paid` flags)
- Settle Later → adds to `deferred_items` (comma-separated like `rejected_items`) — visual only, all unpaid items go to settlement regardless

**Settlement fix (commit `3843401`):** `/api/billing/driver-settlements/generate/route.ts` reads `toll_paid/parking_paid/permit_paid/bata_paid`. If `paid=true`, amount = 0 in settlement. No double payment.

**Client collections in TripCards (pending tab):**
- `type='collection'` entries (client paid driver cash) fetched via `GET /api/driver-advances?status=outstanding&type=collection`
- Shown as orange rows inside each `TripCard`, above "Settle All" button — Banknote icon + amount + note + "Mark Received" button
- "Mark Received" opens a full settle dialog (method + date + note) — on confirm calls `PATCH /api/driver-advances/[id]` with `{ status: 'settled', settled_via, settled_at, note }`
- `CollectionEntry` interface defined at **file level** in `reimbursements/page.tsx` (not inside component) so both page component and `TripCard` can reference it

**"By Driver" toggle (pending tab):**
- Button in controls row (only when pending tab active + 2+ drivers have pending items); hidden by default (`showDriverSummary` defaults to `false`)
- Clicking reveals per-driver summary cards showing total pending reimbursements (`driverTotals` useMemo)
- State resets to hidden when user switches tabs

**Settlement PDF deductions split:**
- `DriverSettlementPDF.tsx` splits deductions: "Advance Given" (type=advance) / "Client Collections" (type=collection) / "Advance Interest ({rate}%)" / "Other Deductions"
- Uses `advance_entries` array filtered by `.type` — falls back to single line if no entries

**`ReimbursementSheet` type:** `sheet_id: string | null`, `has_tripsheet: boolean`, `booking_status: string`, `pickup_location/drop_location/pickup_time/driver_phone: string | null` (active tab only)

- "Offline Trip" button (purple, top-right) → `/bookings/offline-trip` (creates a backdated completed trip outside the booking system)
- `/bookings/offline-trip` page is fully built — creates booking + trip_sheet in one form, supports multi-day local with per-day cards, prefill via `?from=bookingId`

---

## Operator Notifications (`/notifications`)
- `operator_notifications` table has `url TEXT` column — **run migration:** `ALTER TABLE operator_notifications ADD COLUMN IF NOT EXISTS url TEXT;`
- `notifyOperator(message, channel?, url?)` — 3rd param url stored in DB row + used as push click target. Booking notifications pass `/bookings/[id]`.
- Notifications page: cards with `url` are `<Link>` elements — click navigates to booking. Cards without url are plain divs.
- Service worker `notificationclick` fixed to call `c.navigate(url).then(() => c.focus())` so clicking a push on an already-open app navigates (not just focuses).
- Calendar + dashboard tiles: `guest_name ?? client?.name ?? requested_by ?? '—'` — client name shown when no separate guest.

## Analytics — Known Gotcha
- `cancel_reason` does NOT exist on bookings; actual column is `cancelled_reason`. PostgREST silently returns null for the entire query if an unknown column is in the select string — no error thrown, just empty data. Always verify column names against `src/types/index.ts` before adding to a select.

---

## Key API Routes
| Route | Purpose |
|---|---|
| `POST /api/bookings/[id]/assign` | Assign driver to booking — sends trip brief + client driver details |
| `POST /api/bookings/[id]/substitute` | Swap booking-level driver |
| `PATCH /api/bookings/[id]/legs/[legId]` | Assign driver to specific leg — auto-sends to new driver + old driver; client NOT notified here |
| `POST /api/bookings/[id]/legs/[legId]/send-links` | Send day-specific links to same driver |
| `POST /api/bookings/[id]/legs/notify-client` | Manual operator action — within 24h: consolidated free-form all days; outside 24h: ONE template for today's leg (or nearest assigned) + email backup. Operator clicks daily for day-by-day updates. |
| `GET /api/driver-redirect-check` | Smart redirect check — returns correct link for driver's current state |
| `POST /api/driver-status` | Driver arrived/completed form handler |
| `POST /api/webhooks/whatsapp` | Incoming WhatsApp handler |
| `POST /api/webhooks/gmail` | Incoming Gmail handler |
| `GET /api/messages/contacts` | Contact list for inbox (tab=whatsapp\|email\|driver) |
| `GET /api/messages` | Thread messages (phone=, client_id=, or driver_id=) |
| `POST /api/bookings/offline-trip` | Create a backdated offline booking + trip_sheet (no WhatsApp/email sent) |

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
- **PostgREST `.neq()` excludes NULLs:** `col <> 'value'` evaluates to NULL when col IS NULL — `.neq('x','y')` silently hides rows where x is NULL. Always use `.or('x.is.null,x.neq.y')` when NULLs should be included.
- **Supabase `.maybeSingle()` returns null on multiple rows:** Never use `.maybeSingle()` when multiple rows could legitimately match (e.g. same gmail_thread_id with 2 bookings for 2 cabs, or same client/date/time). It silently returns `{ data: null }` — not the first row, not an array — causing logic to fall through as if nothing was found. Use a plain list query + `data && data.length > 0` check instead. Affected: gmail webhook fill-missing check, parse-message duplicate guard (both fixed 2026-06-19).
- **Do NOT add a default date window to `GET /api/bookings`:** Adding `createdFrom` by default breaks booking ref search for old records — operators look up historical bookings by ref regularly. If query performance is a concern, use pagination or a dedicated search endpoint instead.
- **`.next/types/validator.ts` TS errors are pre-existing stale cache:** References to deleted routes (`admin/archive-backup`, `admin/archive-delete`, `cron/backup`) in this file are NOT real errors — `.next/` is gitignored and Vercel builds clean. Run `rm -rf .next` locally to clear if distracting.
- **NEVER modify live production bookings for testing:** Do not PATCH real bookings via Supabase REST or API calls to inject test data (e.g. fake `pickup_stops`). Create a fresh test booking via the UI instead. Local `.env.local` WhatsApp token is usually expired — use the Resend button in the UI (uses live Vercel env).
- **Next.js proxy matcher — no capturing groups:** `src/proxy.ts` `config.matcher` uses path-to-regexp syntax. Capturing groups `(a|b)` are forbidden and cause a build failure ("Capturing groups are not allowed"). Always use separate alternates: `[^/]+\.png|[^/]+\.jpg` NOT `[^/]+\.(png|jpg)`. Negative lookaheads `(?!...)` are fine. Static files that must be publicly accessible (images, fonts) should be excluded in the matcher, not in `isPublicPath`.
- **Outgoing emails are HTML:** `src/lib/gmail/send.ts` sends `Content-Type: text/html`. Plain-text `body` strings are HTML-escaped with `\n` → `<br>`. The `DEFAULT_SIGNATURE` is an HTML table with JMS logo. Do NOT restore the old `app_settings` DB lookup for the signature — it silently overrides code changes (no settings UI exists).
