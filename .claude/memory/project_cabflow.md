---
name: CabFlow Platform
description: Full-stack PWA cab service management platform — build status, tech stack, WhatsApp flow architecture, shipped features, pending work
type: project
originSessionId: dbeb67e1-2a63-46e5-96ed-97a96d3924d8
---
CabFlow is a Next.js 16 App Router PWA built at `/Users/sami/Documents/JMS Travels Booking Tracker/cabflow/`.

**Why:** Replaces manual WhatsApp/Gmail-based booking intake with AI-powered automation for a cab service doing ~50 bookings/day (90% corporate).

**Tech stack:** Next.js 16.2.4 + shadcn/ui (base-ui variant) + Supabase + Gemini 2.5 Flash + Meta WhatsApp API + Gmail API + TanStack Query + Tailwind v4 + date-fns + SheetJS

**Important shadcn note:** This project uses the newer shadcn with `@base-ui/react` — Button does NOT support `asChild`, Select `onValueChange` receives `string | null` (must guard with `v !== null`), DropdownMenuTrigger does not support `asChild`. Created `ButtonLink` component at `src/components/ui/button-link.tsx` as the `asChild` replacement.

---

## Deployment

- **Production URL:** `https://booking.jmstravels.net`
- **GitHub repo:** `https://github.com/Cliff0930/jms-travels-booking-tracker`
- **Vercel account:** `jmstravelprabhu-1531` (GitHub connected as `Cliff0930`)
- **Latest pushed commit:** `0a82369` — Fix tripsheet closing data not saving and GPS summary not showing
- **Deploy method:** Push to GitHub main → auto-deploys to Vercel. Never use Vercel CLI.

### Manual deploy fallback (if auto-deploy breaks)
```bash
curl -X POST "https://api.vercel.com/v13/deployments?teamId=team_072mzg5tYyji5C8yBs3k5I7l&forceNew=1" \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"name":"jms-travels-booking-tracker","gitSource":{"type":"github","repoId":1224544727,"ref":"main"},"target":"production","project":"prj_SKLAP3Anio26Ajis7MqDyUe1r0sY"}}'
```
GitHub repo ID: `1224544727`, Vercel project ID: `prj_SKLAP3Anio26Ajis7MqDyUe1r0sY`, Team ID: `team_072mzg5tYyji5C8yBs3k5I7l`

### Required Vercel environment variables (all set ✓)
- `GOOGLE_MAPS_API_KEY` — enables Distance Matrix API (office distance calc) + Maps Static API (GPS route map images). APIs enabled: Maps Static API + Distance Matrix API. Set 2026-05-17.

---

## WhatsApp Flow (CURRENT — session-based, inline ack)

**Architecture:** Conversation sessions accumulate fields across messages. Booking created when all mandatory fields complete. Session marked `complete` BEFORE booking creation to prevent duplicates on Vercel timeout.

### Key files
- `src/app/api/webhooks/whatsapp/route.ts` — orchestrator
- `src/lib/gemini/converse.ts` — `converseBooking()` + `isComplete()` + date sanitization
- `src/lib/gemini/prompts.ts` — CONVERSATION_PROMPT (supports booking/enquiry/cancel_request/modify_request/other intents)
- `src/lib/whatsapp/send.ts` — `sendWhatsAppMessage({ to, body, log? })`
- `src/lib/utils/change-handler.ts` — handles client cancel/modify requests via WhatsApp

### Per-message flow
1. Webhook receives message → parallel: check APPROVE/REJECT reply + look up client
2. Load or create `conversation_session` for this phone (2-hour timeout, `collecting` + `booking_id IS NULL`)
3. Add message to session → run `converseBooking()` with full history
4. Intent `cancel_request` or `modify_request` → `handleClientChange()` → reply + notify operator
5. If `is_complete = false` → send `next_question`
6. If `is_complete = true` → **immediately mark session complete** → create booking → send ack

### Duplicate booking prevention (critical)
- Session marked `complete` as a **separate await BEFORE** `createBookingFromResult()` — prevents reuse if Vercel 10s timeout hits during ack send
- Session query guards: `.in('status', ['collecting'])` + `.is('booking_id', null)`

### Date handling
- `{today}` and `{tomorrow}` replaced with actual YYYY-MM-DD in prompt before sending to Gemini
- Server-side sanitization after Gemini response: "today"/"tomorrow" text → actual date
- Dates display as "3 May 2026 (Today)" / "4 May 2026 (Tomorrow)" in UI

### Cancel/Modify via WhatsApp (shipped 2026-05-03)
| Situation | Cancel | Modify |
|---|---|---|
| No driver, >2h | Auto-cancelled, operator info WA | Auto-applied, operator info WA |
| Driver assigned, >2h | Not cancelled — operator urgent alert | Logged as pending — operator alert |
| Driver assigned or <2h | Hard block — tell client to call | Hard block — tell client to call |
| In progress | Hard block | Hard block |
All changes written to `booking_edit_logs` with `changed_by = 'Client (WhatsApp)'`.

### Approval routing
```
isPersonal = booking_type === 'personal'
isExcluded = company.approval_exclusions.includes(client.id)  // UUIDs, not phone/email
needsApproval = !isPersonal && company_id && company.approval_required && !isExcluded
```

### Mandatory fields by trip type
- **Local**: pickup_location, pickup_date, pickup_time
- **Outstation**: pickup_location, pickup_date, pickup_time, drop_location, total_days
- **Airport**: pickup_location, pickup_date, pickup_time
- **Corporate clients**: also require `booking_type` ('company' or 'personal')

### Bot reply behaviour
- **cancel_request / modify_request** → `handleClientChange()` with state-based rules
- **Enquiry** → "For rates and pricing information, please call us at 9845572207."
- **Other** → "For queries regarding an existing booking, please call us at 9845572207."
- **Booking, fields missing** → `next_question` with ALL missing fields at once
- **Booking complete** → booking draft created, ack sent with Ref + Date + Pickup + Drop

### Ack message format
```
Hi [name], we have received your booking request.

Ref: BK-XXXX
Date: 3 May 2026, 9:00 AM
Pickup: Indiranagar
Drop: Whitefield (if given)

Our team will review and confirm your booking shortly.
```

---

## Driver Notification Flow + Tripsheet + Short Links (shipped 2026-05-07) ✓

| Trigger | Driver receives | Client receives |
|---|---|---|
| Operator assigns driver | Trip brief with arrived/completed links | Driver name, phone, vehicle, plate, pickup date/time |
| Driver taps "Arrived" link | Form: Tripsheet # + Opening KM + GPS | "Your driver [name] has arrived" + vehicle |
| Driver taps "Completed" link | Form: Closing KM + GPS | Trip completed thank-you with booking summary |

### Tripsheet system
- `trip_sheets` table: `booking_id, driver_id, booking_leg_id, tripsheet_number, opening_km, opening_lat/lng, opening_time, manual_opening_time, closing_km, closing_lat/lng, closing_time, manual_closing_time, toll_amount, parking_amount, permit_amount, office_to_pickup_km, drop_to_office_km, gps_km, route_image_url, updated_at`
- ⚠️ Many columns were added post-creation via ALTER TABLE — if recreating from scratch, run all migrations in `supabase-schema.sql`
- Driver KM = closing_km − opening_km (computed on display)
- Duration: local = hours/minutes, outstation = days + hours (from opening_time → closing_time timestamps)
- Office→Pickup and Drop→Office via Google Maps Distance Matrix API at completion time
- Grand Total = driver KM + office_to_pickup_km + drop_to_office_km
- **GOOGLE_MAPS_API_KEY added to Vercel ✓** — distance calculation active when office address set in Settings
- Distance toggle in Settings → General (`distance_calculation_enabled` in app_settings)
- Office address in Settings → General (`office_location` JSON in app_settings)
- Toll and parking fields on completed form, shown in Tripsheet tile

### Short link system
- `short_links` table: `code (6-char), target_url, booking_id, used_at, expires_at (nullable)`
- All driver and approval links sent as `https://booking.jmstravels.net/r/xxxxxx`
- Links expire ONLY on: (1) driver submits form, (2) approval actioned, (3) booking cancelled
- No time-based expiry — links stay alive for multi-day/extended trips
- Cancelling a booking calls `expireBookingLinks(id)` → marks all booking's links as used
- `/r/[code]` shows "Link Already Used" or "Invalid Link" pages (no redirect)
- Helper: `src/lib/utils/short-link.ts` — `createShortLink(url, bookingId)`, `markShortLinkUsed(code)`, `expireBookingLinks(bookingId)`

### GPS Tracking Toggle Per Booking (shipped 2026-05-18) ✓

Operator can enable GPS tracking:
- In the **booking detail page** (`/bookings/[id]`) → right panel "GPS Tracking" card with Switch toggle
- In **AssignDriverModal** — GPS toggle button (Navigation icon, ON/OFF pill)
- `handleGpsToggle` calls `PATCH /api/bookings/[id]` with `{ gps_tracking_enabled: bool }` then invalidates query

### Per-Company Trip Origin Address (shipped 2026-05-18) ✓

Companies page → detail panel now has "Trip Origin Address" field (`pickup_origin_address` column on companies table).
When set, distance calculation uses company address as the origin instead of the JMS office address.
- `src/app/api/driver-status/route.ts` — checks `booking.company.pickup_origin_address` first, falls back to JMS office from app_settings
- SQL migration: `ALTER TABLE companies ADD COLUMN IF NOT EXISTS pickup_origin_address TEXT;` ← **must be run in Supabase**

### AI Kill Switch (shipped 2026-05-18) ✓

Settings → General tab → "AI Processing" card (very top). When disabled:
- WhatsApp webhook saves raw_messages but does NOT call processClientMessage (Gemini skipped)
- Gmail webhook saves raw_messages but does NOT call `/api/ai/parse-message`
- Process-conversations cron returns early (`{ ok: true, processed: 0, skipped: true }`)
- Messages queue up safely; re-enable the switch to resume processing
- Toggle stored as `ai_processing_enabled` key in `app_settings` table
- Kill switch card turns red when disabled; admin-only toggle
- Key files: `src/app/api/webhooks/whatsapp/route.ts`, `src/app/api/webhooks/gmail/route.ts`, `src/app/api/cron/process-conversations/route.ts`, `src/app/api/settings/route.ts` (added to ALLOWED_KEYS), `src/app/(dashboard)/settings/page.tsx`

### Resend Message Feature (shipped 2026-05-18) ✓

Booking detail page → Actions card → "Resend Message" button (RotateCcw icon). Sends any of:
- **Booking Confirmed** — full booking summary to client via WhatsApp or email
- **Driver Details** — driver name/phone/vehicle to client via WhatsApp or email
- **Trip Brief (Driver)** — trip brief with short links to driver via WhatsApp

Dialog allows overriding the recipient (different number or email). Logs to message_logs on send.
- Route: `POST /api/bookings/[id]/resend` with `{ message_type, channel, override_recipient? }`
- Regenerates message content from current booking data (not stored templates for booking_confirmed/driver_details)
- Key files: `src/app/api/bookings/[id]/resend/route.ts` (NEW), `src/app/(dashboard)/bookings/[id]/page.tsx`

### GPS Trip Tracking (shipped 2026-05-17, updated 2026-05-21) ✓

GPS tracking enabled per booking (see toggle above). When enabled:

1. Driver taps "Arrived" link → fills tripsheet form → submits → `gps_active` mode
2. GPS captured via **Page Visibility API**: pings on every tab-focus event (driver can freely switch to Google Maps; each time they return, a coordinate logs). No interval timer.
3. Driver submits completion form → GPS stops; server fetches all `trip_gps_logs`, calculates GPS KM via haversine, generates route map
4. Route map: Google Maps Static API (640×400, blue path, green S + red E markers, subsampled to ≤100 points) → saved to Supabase Storage bucket `route-maps` (must be **Public**)
5. Booking detail page shows "GPS KM" row in tripsheet + clickable route map image

**Driver page state machine:** `form → gps_active → done`
- `gps_active`: shows "Trip In Progress" (Radio icon), opening KM summary, completion form — no GPS UI exposed to driver
- `isTrackingRef` boolean controls whether visibilitychange pings fire
- GPS coordinates (pickup + drop) captured silently via `silentlyCaptureGPS()` on form submit — no "Capture Location" button shown to driver
- On transition to gps_active: lat/lng state cleared to avoid stale pickup coords being sent as drop coords

**Key files:**
- `src/lib/utils/haversine.ts` — `totalDistanceKm(points[])` using haversine formula (no API)
- `src/app/api/driver/gps-log/route.ts` — POST GPS pings; requires `gps_tracking_enabled` on booking
- `src/app/api/driver-status/route.ts` — on "completed": calculates gps_km, calls `generateAndSaveRouteMap()` non-blocking
- `src/app/driver-status/page.tsx` — state machine: form → gps_active → done; Page Visibility GPS
- `src/components/bookings/AssignDriverModal.tsx` — GPS toggle (Navigation icon, ON/OFF pill)
- `src/app/(dashboard)/bookings/[id]/page.tsx` — GPS KM row + route map image in tripsheet

**DB columns:** `trip_gps_logs` table (id, booking_id, trip_sheet_id, lat, lng, created_at), `bookings.gps_tracking_enabled` (boolean default false), `trip_sheets.gps_km` (numeric), `trip_sheets.route_image_url` (text)

**⚠️ Supabase Storage:** Bucket `route-maps` must exist and be set to **Public** — required for route map image URLs to work.

### Per-day links for multi-day local
- TripLegsPanel shows "Day X Links" button on each leg (when driver assigned, leg not completed)
- Tapping sends WhatsApp to driver with day-specific arrived/completed short links
- Each day's trip_sheets row has `booking_leg_id` to tie KM to the correct leg
- `POST /api/bookings/[id]/legs/[legId]/send-links` — generates and sends day links
- Outstation and single-day local: unchanged (one arrived + one completed for whole booking)

### Key files
- `src/app/api/bookings/[id]/assign/route.ts` — sends trip brief + short links to driver; driver details to client
- `src/app/api/driver-status/route.ts` — handles arrived/completed forms, saves trip_sheets (leg-aware), calculates distances, marks short link used
- `src/app/api/bookings/[id]/trip-sheet/route.ts` — GET latest trip sheet for a booking
- `src/app/api/bookings/[id]/legs/[legId]/send-links/route.ts` — send day-specific links for multi-day local
- `src/app/api/settings/route.ts` — GET/POST app_settings (office_location, distance_calculation_enabled, email_signature)
- `src/app/api/approve/route.ts` — marks short link used after approval
- `src/app/api/bookings/[id]/cancel/route.ts` — expires all booking short links on cancel
- `src/app/r/[code]/route.ts` — short link redirect handler
- `src/app/driver-status/page.tsx` — mobile form: tripsheet #, opening/closing KM, toll, parking, GPS
- `src/lib/utils/driver-token.ts` — HMAC token for driver status links
- `src/lib/utils/short-link.ts` — short link helpers
- `src/app/(dashboard)/settings/page.tsx` — General tab: office location + distance toggle
- `src/app/(dashboard)/bookings/[id]/page.tsx` — Tripsheet tile: KM, duration, distances, grand total
- `src/components/bookings/TripLegsPanel.tsx` — per-leg driver assign + Send Day X Links button

---

## Multi-day booking legs
- `total_days > 1` → creates N `booking_legs` rows using UTC date math (not local time)
- Works for ALL trip types (local, outstation, airport) — not just outstation
- Both WhatsApp and Confirm routes use `upsert(onConflict: 'booking_id,day_number')` — no duplicates
- Driver switching per leg: `vehicle_swaps` table
- **Extension**: edit route inserts new legs when `total_days` increases; existing legs preserved (status not reset)

---

## Booking List Enhancements (shipped 2026-05-19) ✓

- **BookingCard**: traveller name + "Booked by [coordinator]" row (only when guest differs); company badge derived from `booking.company?.name || booking.client?.company?.name`; Corporate (blue) / Personal (orange) pill badges; amber border + "Possible duplicate" badge when `flags.includes('possible_duplicate')`
- **Bookings page filter bar**: Corporate/Personal toggle pills added; company dropdown also derives from `booking.client?.company?.name` (previously only `booking.company?.name`)
- **Bookings API (GET)**: client join updated to include company → `client:clients!client_id(id, name, primary_phone, primary_email, client_type, is_vip, is_verified, company:companies!company_id(id, name))`; `client_id` filter changed to `.or('client_id.eq.X,guest_client_id.eq.X')` so guest trips appear on client profile
- Key files: `src/components/dashboard/BookingCard.tsx`, `src/app/(dashboard)/bookings/page.tsx`, `src/app/api/bookings/route.ts`

---

## Message Log Chat-Bubble UI (shipped 2026-05-19) ✓

Replaced MessageTimeline with `BookingMessageChat` — WhatsApp-style chat bubbles with per-contact tabs.

- **Tabs**: All | Booker (named after client) | Guest (shown if guest_name set) | Driver (shown if driver assigned) — filtering by `driver_id`, `client_id`, `recipient`/`sender` phone+email
- **Outbound**: right-aligned blue bubble; **Inbound**: left-aligned grey bubble
- **Incoming email**: `fill-missing.ts` now stores inbound reply email into `raw_messages` (with `booking_id`) at the START of `fillMissingFromReply()` — previously only outbound was stored
- **WhatsApp message backfill**: messages API looks up `conversation_sessions` by `booking_id` → fetches `raw_messages` from session phone since session start → backlinks any unlinkd messages with `UPDATE raw_messages SET booking_id = id`
- Key files: `src/components/bookings/BookingMessageChat.tsx` (NEW), `src/app/api/bookings/[id]/messages/route.ts`, `src/lib/email/fill-missing.ts`

---

## WhatsApp Multi-Booking Handling (shipped 2026-05-19) ✓

Coordinators often send a second booking before the first session closes (2-hour window). Two behaviours added:

### Session reset on new booking (is_new_booking_request)
When Gemini returns `is_new_booking_request=true` and the session has prior messages:
- Session messages/extracted cleared immediately (`messages: [], extracted: {}`)
- `converseBooking()` re-run with only the new message
- Result: second booking gets its own fresh extraction context

### Duplicate hard-block
Before creating a booking from a WhatsApp session, checks for **exact duplicate** (same `client_id + pickup_date + pickup_location ilike + pickup_time`):
- Match found → sends WhatsApp message: "it looks like this booking already exists — Ref: BK-XXXX"
- Session deleted; no booking created
- If same date+location but different time: not blocked (falls through to possible-duplicate soft check)

Key file: `src/app/api/webhooks/whatsapp/route.ts`

---

## Legs-Due Filter + Early Completion (shipped 2026-05-19) ✓

### Legs-Due Filter on Bookings Page
- **"Today's Legs" / "Tomorrow's Legs"** filter pills in the bookings page filter bar (green, `#059669`)
- When active, shows a dedicated section above the tabs — one `LegsDueCard` per leg
- Each card: Day circle, booking ref, traveller, pickup→drop, driver info, **"Send Day X Links"** button inline (no need to open booking)
- Amber border on cards where links haven't been sent yet; green "Sent · time" badge when sent
- Auto-refreshes every 60 seconds
- New API: `GET /api/bookings/legs-due?date=YYYY-MM-DD` — queries `booking_legs` for that date, joins booking data; sorted by links-not-sent first
- New component: `src/components/bookings/LegsDueCard.tsx`

### Early Completion (Complete Early)
- **"Complete Early"** button in Actions card — appears when `total_days > 1` and status is `confirmed` or `in_progress`
- Dialog with optional reason text
- API: `POST /api/bookings/[id]/complete-early` — cancels all `upcoming` legs, completes `in_progress` leg, sets booking to `completed`, logs to `booking_status_history`
- `BookingLeg.leg_status` type extended with `'cancelled'` (no DB migration needed — column is plain text)
- Key files: `src/app/api/bookings/legs-due/route.ts` (NEW), `src/app/api/bookings/[id]/complete-early/route.ts` (NEW), `src/components/bookings/LegsDueCard.tsx` (NEW), `src/app/(dashboard)/bookings/page.tsx`, `src/app/(dashboard)/bookings/[id]/page.tsx`

---

## Multi-Day Local / Airport + Booking Extension (shipped 2026-05-19) ✓

### Trip type KM behaviour (critical — affects tripsheet logic)
| Trip type | KM behaviour |
|---|---|
| **Outstation** | One continuous tripsheet — opening KM on Day 1, closing KM on last day |
| **Local multi-day** | Each day is independent — opening + closing KM per leg; one `trip_sheets` row per leg |
| **Airport + Local multi-day** | Day 1 = airport pickup leg, Days 2-N = local legs — per-day KM like local |

The backend has always supported `total_days > 1` for ANY trip type (confirm route creates legs on `total_days > 1`, not just outstation). The gap was UI-only.

### Changes made
- **Total Days field** now always visible in new booking form and edit form (previously hidden for non-outstation)
- **New booking summary strip** shows "Days: N" whenever `total_days > 1` (previously only outstation)
- **TripLegsPanel** now accepts `tripType` prop and shows per-leg badges:
  - `airport` booking, Day 1 → amber "Airport Pickup" badge
  - `airport` booking, Days 2+ → green "Local" badge
  - `local` booking → green "Local" badge on each leg
  - `outstation` → no extra badge
- **Booking extension via edit**: `POST /api/bookings/[id]/edit` now inserts new `booking_legs` rows when `total_days` increases — only adds rows for new days (skips existing to preserve completed/in-progress status); detail page invalidates `['booking-legs', id]` query on save
- Key files: `src/app/(dashboard)/bookings/new/page.tsx`, `src/app/(dashboard)/bookings/[id]/page.tsx`, `src/components/bookings/TripLegsPanel.tsx`, `src/app/api/bookings/[id]/edit/route.ts`

### Mixed airport + local booking flow
Book as `trip_type = 'airport'`, `total_days = 3`. Day 1 = Airport Pickup label, Days 2-3 = Local label. Driver gets separate "Send Day X Links" per leg — each with its own opening/closing KM form and independent trip_sheet row.

---

## Possible Duplicate Flagging (shipped 2026-05-19) ✓

Softer check — does not block booking creation, just flags for operator review.

### Detection logic
Same `client_id + pickup_date` + (guest_name first token match OR pickup_location first-3-words match) → flags both the new booking AND the existing similar booking with `'possible_duplicate'` in their `flags[]` array.

Runs in `POST /api/bookings` after booking creation. Also exposed as:
- `GET /api/bookings/[id]/similar` — returns similar bookings for a given booking (same client, same date, matching guest/location prefix; excludes cancelled/completed)

### UI
- **BookingCard**: amber border + "Possible duplicate" pill badge
- **Booking detail page**: amber warning banner (above main grid) showing:
  - Each similar booking (ref, status, guest, location, date/time)
  - "Cancel [Other Ref]" button per similar booking (calls `/api/bookings/[otherId]/cancel` with reason "Duplicate of [this ref]")
  - "Cancel This One" button (calls cancel with reason "Duplicate of [otherRef]")
  - "Not a duplicate — dismiss" button (PATCHes booking to strip `possible_duplicate` from flags)
- "Duplicate Booking" added to CANCEL_REASONS dropdown
- Key files: `src/app/api/bookings/route.ts` (POST), `src/app/api/bookings/[id]/similar/route.ts` (NEW), `src/components/dashboard/BookingCard.tsx`, `src/app/(dashboard)/bookings/[id]/page.tsx`

---

## Refresh Buttons (shipped 2026-05-18) ✓
- **Bookings page** (`/bookings`): Refresh button (RefreshCw icon) with `animate-spin` while refreshing — calls `refetch()` on bookings query; visible to all roles
- **Dashboard** (`/`): Refresh button already existed — updated to await both `refetch()` + invalidate `today-links` query, spin animation while loading

## Booking List Page — UI features (shipped 2026-05-03) ✓
- **Trip type tags**: Local (green), Outstation (purple), Airport (amber) on every card
- **Received timestamp**: "Received 3 May 2026, 2:45 PM" shown in card footer strip
- **Date format**: Always actual date "3 May 2026"; today/tomorrow get parenthetical "(Today)"/"(Tomorrow)"
- **Filter bar** (redesigned 2026-05-03): white card container, Today/Tomorrow/New Today as a single segmented button group, date picker + company dropdown as separate controls, clear filters button, mobile-friendly flex-wrap layout
- **BookingCard** (redesigned 2026-05-03): main content section + footer strip (`bg-[#F9FAFB]`, `border-t`); footer holds received timestamp (left) + flags + Assign Driver button (right); muted icon colors for better hierarchy; `overflow-hidden` on outer div for clean status left-border
- Key files: `src/app/(dashboard)/bookings/page.tsx`, `src/components/dashboard/BookingCard.tsx`

---

## Booking Detail Page — UI features
- **Trip Timeline** card in right sidebar: Received → [Approval] → Confirmed → Driver Assigned → In Progress → Completed
  - Green checkmarks for done, blue ring for active, grey for upcoming, red X for cancelled
  - Approval step shown only when `approval_status` set or `company.approval_required`
- **Edit mode**: Blue-bordered inputs, requires reason dialog before save
- **Edit History** panel: shows all manual + client-initiated changes with who/when/why
- **Confirm route**: status guard (cannot confirm cancelled/completed), optimistic lock on status column

---

## Companies — Approval Settings
- `approval_required` toggle per company
- `approval_channel`: email | whatsapp | both
- `approval_timeout_hours`
- `approval_exclusions`: array of client UUIDs — clients who bypass approval
- **ClientExclusionPicker** in companies/page.tsx: searchable dropdown scoped to company's clients, stores UUID

---

## User Management (shipped 2026-05-03) ✓

### Roles
| Role | Access |
|------|--------|
| admin | Full access + manage users via /users page |
| operator | Create/manage bookings, clients, drivers |
| viewer | Read-only, no actions |

### Key files
- `src/app/api/auth/me/route.ts` — GET current user profile (falls back to viewer)
- `src/app/api/users/route.ts` — GET list, POST create (admin only)
- `src/app/api/users/[id]/route.ts` — PATCH role/status, DELETE (admin only)
- `src/hooks/useCurrentUser.ts` — `useCurrentUser()`, `useIsAdmin()`, `useCanEdit()`
- `src/app/(dashboard)/users/page.tsx` — Users management page

---

## Message Log (shipped 2026-05-03) ✓
- **Flat list mode**: direction tabs, date From/To filters, newest first
- **Client chat mode**: WhatsApp-style bubbles, date separators, booking links inline
- Key files: `src/app/api/messages/route.ts`, `src/app/(dashboard)/messages/page.tsx`

---

## Database state (as of 2026-05-17)

**Full data wipe performed 2026-05-17.** All bookings, clients, companies, drivers, trip sheets, GPS logs, messages, conversation sessions deleted. Booking counter reset to 0 → next booking = `BK-2026-0001`.

**booking_counters table columns:** `year` (int), `last_seq` (int) — reset with: `UPDATE booking_counters SET last_seq = 0 WHERE year = 2026;`

**20 real drivers seeded** (2026-05-17) with `secondary_phone` column. Drivers with 2 phones: Samson, Subbu, Prasad. Contact line shows `primary / secondary` when both present.

## SQL migrations run ✓
user_profiles, booking_edit_logs, booking_type column, approval_exclusions column, idx_clients_primary_phone_unique, idx_companies_name_lower_unique, app_settings (with gmail_last_history_id seed), trip_sheets table (with toll_amount, parking_amount, office_to_pickup_km, drop_to_office_km, booking_leg_id, **gps_km**, **route_image_url**), short_links table, short_links.booking_id + expires_at nullable, companies email_intake_mode/direct_booking_emails/driver_notify_target columns, bookings.requested_by (text), bookings.cc_emails (text[] default '{}'), bookings.gmail_thread_id (text) + idx_bookings_gmail_thread_id, operator_notifications table + GRANT, raw_messages.processed_at column, **trip_gps_logs table + GRANT**, **bookings.gps_tracking_enabled (boolean default false)**, **drivers.secondary_phone (text)**, **companies.pickup_origin_address (text)** ✓ 2026-05-18

### trip_sheets ALTER TABLE columns (all run 2026-05-21) ✓
The `trip_sheets` table was created before many columns were added. All run in Supabase SQL Editor:
```sql
ALTER TABLE trip_sheets ADD COLUMN IF NOT EXISTS booking_leg_id uuid references booking_legs(id);
ALTER TABLE trip_sheets ADD COLUMN IF NOT EXISTS opening_lat double precision;
ALTER TABLE trip_sheets ADD COLUMN IF NOT EXISTS opening_lng double precision;
ALTER TABLE trip_sheets ADD COLUMN IF NOT EXISTS closing_lat double precision;
ALTER TABLE trip_sheets ADD COLUMN IF NOT EXISTS closing_lng double precision;
ALTER TABLE trip_sheets ADD COLUMN IF NOT EXISTS manual_opening_time text;
ALTER TABLE trip_sheets ADD COLUMN IF NOT EXISTS manual_closing_time text;
ALTER TABLE trip_sheets ADD COLUMN IF NOT EXISTS gps_km numeric;
ALTER TABLE trip_sheets ADD COLUMN IF NOT EXISTS office_to_pickup_km numeric;
ALTER TABLE trip_sheets ADD COLUMN IF NOT EXISTS drop_to_office_km numeric;
ALTER TABLE trip_sheets ADD COLUMN IF NOT EXISTS route_image_url text;
ALTER TABLE trip_sheets ADD COLUMN IF NOT EXISTS updated_at timestamptz default now();
ALTER TABLE trip_sheets ADD COLUMN IF NOT EXISTS toll_amount numeric;
ALTER TABLE trip_sheets ADD COLUMN IF NOT EXISTS parking_amount numeric;
ALTER TABLE trip_sheets ADD COLUMN IF NOT EXISTS permit_amount numeric;
-- After any ALTER TABLE: NOTIFY pgrst, 'reload schema';
```

## SQL migrations still pending
```sql
-- Clean up any stuck sessions (run if needed)
UPDATE conversation_sessions SET status = 'complete'
WHERE status = 'collecting' AND booking_id IS NOT NULL;
UPDATE conversation_sessions SET status = 'abandoned'
WHERE status = 'collecting' AND last_message_at < now() - interval '2 hours';
```

---

## WhatsApp Modify/Cancel — Multi-Booking Disambiguation (shipped 2026-05-06, fixed 2026-05-14) ✓

When a client has multiple active bookings and sends a cancel/modify message:
1. Bot lists **all upcoming bookings** (pickup_date >= today IST, no cap) with ref, date, time, guest name, trip type, destination — ordered soonest first
2. Client replies with: number (1/2/3), booking ref (BK-XXXX), guest name, destination, trip type keyword, or time
3. `handleDisambiguationReply()` resolves and performs the action on the correct booking
4. `PendingAction` stored in `conversation_sessions.extracted.pending_action` between turns

**Fixes applied 2026-05-14:**
- Old past bookings (pickup_date < today) were showing in disambiguation — fixed by adding `.or('pickup_date.is.null,pickup_date.gte.TODAY')` filter
- Order changed to `ascending: true, nullsFirst: false` — soonest upcoming trip shows first
- Removed `slice(0, 5)` cap — all upcoming bookings are now shown

If Gemini already extracts a `target_booking_ref` or `guest_name` from the modify/cancel message, the system narrows down automatically without asking.

Key files: `src/lib/utils/change-handler.ts`, `src/app/api/webhooks/whatsapp/route.ts`

### Multi-field modification (shipped 2026-05-06) ✓
`ModificationRequest.changes` is now an array — "change date AND time" applies both fields atomically.
Short acknowledgement messages ("No", "Confirm booking", "OK", "Thanks") → `other` intent, no longer triggers booking intake.

### Operator Apply/Dismiss for pending changes (shipped 2026-05-06) ✓
`src/app/api/bookings/[id]/apply-pending/route.ts` — operator can apply or dismiss [PENDING] change requests from booking detail page Edit History panel.

---

## Email bookings activation — LIVE (activated 2026-05-06) ✓

- Gmail Watch active, auto-renewed daily at 3am UTC by cron
- Pub/Sub topic: `projects/jms-travels-booking-tracker/topics/gmail-notifications`
- Push subscription → `https://booking.jmstravels.net/api/webhooks/gmail`
- **Auth: Service account + domain-wide delegation** (switched 2026-05-20 — OAuth was permanently blocked by Google Workspace)
  - Service account: `jms-travels-booking-tracker@jms-travels-booking-tracker.iam.gserviceaccount.com`
  - Impersonates: `bookings@jmstravels.net` (subject field in JWT)
  - Key stored as: `GOOGLE_SERVICE_ACCOUNT_KEY` (base64 JSON) in Vercel ✓
  - **GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET / GMAIL_REFRESH_TOKEN are no longer used**
- Env vars in Vercel: `GOOGLE_SERVICE_ACCOUNT_KEY`, `GOOGLE_PUBSUB_TOPIC`, `GMAIL_USER_EMAIL=bookings@jmstravels.net`, `CRON_SECRET`
- **If Gmail ever breaks**: check domain-wide delegation still active at admin.google.com → Security → API controls → Domain-wide delegation. Service account key never expires.

### Gmail historyId management (fixed 2026-05-06)
- `app_settings` table in Supabase stores `gmail_last_history_id` (key-value)
- Webhook reads this as `startHistoryId` for `history.list` — correct Google-recommended pattern
- Webhook updates the stored historyId after each notification
- `renew-gmail-watch` also upserts historyId on every daily renewal
- Seed SQL: `INSERT INTO app_settings (key, value) VALUES ('gmail_last_history_id', '805937');`
- Latest commits: `9ff90f5` (historyId fix), `2b224dd` (debug logging)

---

## Client module (shipped 2026-05-07) ✓

### Guest Directory
- `client_type = 'guest'` with `guest_of_company_id` FK to companies
- Booking detail page: "Save to Guest Directory" button when `flags.includes('guest_booking')`
- Clients list: amber avatar, "Guest of [Company]" sub-label, guest filter tab
- Client panel: amber "Guest of [Company]" in Company section, Promote button to convert to corporate/walkin

### Company dropdown (CompanyCombobox)
- `src/components/shared/CompanyCombobox.tsx` — custom searchable dropdown (no Popover/Command needed)
- Props: `value: string, companies: Company[], onChange: (id: string) => void`
- Shows company name (not UUID); input appears when open for live filtering; X to clear
- Used in: Add Client modal (`clients/page.tsx`) + Edit Client dialog (`ClientDetailPanel.tsx`)
- **Do NOT use shadcn Select for company — it shows UUID instead of name**

### Client Detail Panel (ClientDetailPanel.tsx)
- Fetches full data via `useClient(id)` (includes contacts + locations) — list query doesn't have these
- Fixed: detail endpoint uses `company:companies!company_id(*)` disambiguation (two FKs to companies)
- Edit client: name, phone, email, designation, type, company
- Additional contacts (client_contacts): add, edit, delete with pencil/trash on hover
- Saved locations (client_locations): add, edit, delete with pencil/trash on hover
- Booking tabs: All / Company / Personal with counts; unclassified badge for null booking_type
- Merge: search for duplicate → confirm → moves all bookings, message_logs, contacts, locations; deletes duplicate
- API routes: `/api/clients/[id]`, `/api/clients/[id]/contacts`, `/api/clients/[id]/contacts/[contactId]`, `/api/clients/[id]/locations`, `/api/clients/[id]/locations/[locationId]`, `/api/clients/[id]/merge`

### Auto-create client from email
- Gmail webhook passes `sender_name` to parse-message
- parse-message creates a new `corporate` client (name + email) when a booking arrives from an unknown email — not triggered for junk/enquiry

---

## Operator Notifications Page (shipped 2026-05-14) ✓

Every `notifyOperator()` call now persists to `operator_notifications` table (fire-and-forget).

- `operator_notifications` table: `id, title, body, channel (alerts|ops), read_at, created_at` — GRANT applied ✓
- `src/app/api/notifications/route.ts` — GET (last 200, newest first), POST (mark all read)
- `src/app/(dashboard)/notifications/page.tsx` — lists all notifications, unread count badge, "Mark all read" button, expandable bodies (line-clamp-3), AlertCircle icon for alerts / BookOpen for ops
- `src/lib/utils/notify-operator.ts` — fire-and-forget DB insert added; push URL changed to `/notifications`
- Sidebar: Bell icon link to /notifications (between Reports and Settings)
- MobileNav: Notifications in More menu

---

## Reports Page (full rewrite 2026-05-18) ✓

- New dedicated `/api/reports` endpoint — fetches bookings + trip_sheets in one batch (no N+1)
- All stats and chart data derive from `filteredBookings` (filter-synced — not from raw API result)
- **Filters:** date range (quick presets + custom), Status, Trip Type, Source, Company, Driver, Search
- **8 Stat cards:** Total, In Progress, Completed, Cancelled, Cancel Rate %, Local, Outstation, Airport
- **5 Charts** (all filter-synced):
  - By Status (horizontal bar)
  - By Source (pie)
  - By Trip Type (pie: local/outstation/airport)
  - Daily Volume (bar)
  - Top Companies (horizontal bar, top 8)
- **Table: 22 columns** — responsive: 4 cols mobile, +3 at sm (≥640px), all at lg (≥1024px)
- **Excel export: 30 columns** including all tripsheet data, driver phone, vehicle number
- Key files: `src/app/api/reports/route.ts` (NEW), `src/app/(dashboard)/reports/page.tsx`, `src/app/(dashboard)/reports/ReportsCharts.tsx`

## Mobile / Native App Feel (2026-05-18) ✓

- **`viewport-fit: 'cover'`** in root layout — enables true edge-to-edge on iPhone
- **Header** (`src/components/layout/Header.tsx`): `style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}` — extends behind iOS status bar, inner content stays `h-16`
- **MobileNav** (`src/components/layout/MobileNav.tsx`): `style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}` — sits above iPhone home indicator
- **Dashboard layout** (`src/app/(dashboard)/layout.tsx`): uses `.main-layout` CSS class instead of `pt-16 pb-20 md:pb-6`
- **globals.css**: `.main-layout` class handles safe-area-aware top/bottom padding with responsive desktop override; body gets `overscroll-behavior: none` (no rubber-band bounce) and `-webkit-tap-highlight-color: transparent` (no blue tap flash)
- **Reports table**: responsive columns — `hidden sm:table-cell` / `hidden lg:table-cell` so table is readable on phone (4 cols) without extreme scrolling

## Reimbursements Module (built 2026-05-22) ✓

Full cash reimbursement tracking for drivers post-trip.

### What it tracks per trip sheet
- Tripsheet document receipt (no cash)
- Toll, Parking, Permit — receipt (document) + paid (cash)
- Bata — receipt + paid (cash), amount = bata_driver count × bata_rate

### Pages & API
- `/reimbursements` — main page: pending/settled tabs, driver dropdown, search (name/ref/driver/vehicle name/plate/phone), date range filter, outstanding total, Excel export
- `GET /api/reimbursements` — returns flat list of ReimbursementSheet objects; resolves bata_rate (company override → driver default)
- `PATCH /api/reimbursements/[sheet_id]` — toggle individual received/paid flags; auto-sets `reimbursed_at` when all items settled; `{ revoke: true }` resets everything back to pending

### TripCard UI
Each card shows: booking_ref, TS#[tripsheet_number], driver, vehicle name, plate number (monospace badge), company, pickup date, guest name (falls back to requested_by), phone (falls back to client primary_phone), settlement date. Per-item received (blue pill) / paid (green pill) toggles. "Settle All" button on pending cards. "Revoke" button + settlement date on settled cards.

### Excel Export
Export button appears when results exist. Exports current filtered view (both tabs) as `.xlsx` via SheetJS (already installed). Columns: booking ref, tripsheet#, traveller, phone, driver, vehicle, company, pickup date, toll, parking, permit, bata count/rate/amount, total, settled date.

### Bata Rate System
- `drivers.bata_rate` — driver's default ₹/bata (editable in Driver panel)
- `vehicle_names` table — master list of standardized vehicle names (managed in Settings → Vehicle Names tab)
- `company_bata_rates` table — per-company rate overrides keyed by vehicle_name (managed in Companies → company detail)
- Rate hierarchy: company rate by vehicle_name → driver default → null

### Key files
- `src/app/(dashboard)/reimbursements/page.tsx` — full page with TripCard, ItemRow, Toggle components
- `src/app/api/reimbursements/route.ts`
- `src/app/api/reimbursements/[sheet_id]/route.ts`
- `src/app/api/vehicle-names/route.ts` + `[id]/route.ts`
- `src/app/api/companies/[id]/bata-rates/route.ts`
- `src/app/(dashboard)/settings/page.tsx` — Vehicle Names tab added
- `src/app/(dashboard)/companies/page.tsx` — CompanyBataRates component added
- `src/components/drivers/DriverDetailPanel.tsx` — bata_rate field added

### SQL migrations (must be run in Supabase)
```sql
ALTER TABLE trip_sheets ADD COLUMN IF NOT EXISTS bata_driver integer;
ALTER TABLE trip_sheets ADD COLUMN IF NOT EXISTS tripsheet_doc_received boolean DEFAULT false;
ALTER TABLE trip_sheets ADD COLUMN IF NOT EXISTS toll_received boolean DEFAULT false;
ALTER TABLE trip_sheets ADD COLUMN IF NOT EXISTS parking_received boolean DEFAULT false;
ALTER TABLE trip_sheets ADD COLUMN IF NOT EXISTS permit_received boolean DEFAULT false;
ALTER TABLE trip_sheets ADD COLUMN IF NOT EXISTS bata_received boolean DEFAULT false;
ALTER TABLE trip_sheets ADD COLUMN IF NOT EXISTS toll_paid boolean DEFAULT false;
ALTER TABLE trip_sheets ADD COLUMN IF NOT EXISTS parking_paid boolean DEFAULT false;
ALTER TABLE trip_sheets ADD COLUMN IF NOT EXISTS permit_paid boolean DEFAULT false;
ALTER TABLE trip_sheets ADD COLUMN IF NOT EXISTS bata_paid boolean DEFAULT false;
ALTER TABLE trip_sheets ADD COLUMN IF NOT EXISTS reimbursement_notes text;
ALTER TABLE trip_sheets ADD COLUMN IF NOT EXISTS reimbursed_at timestamptz;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS bata_rate numeric;
CREATE TABLE IF NOT EXISTS vehicle_names (id uuid primary key default uuid_generate_v4(), name text not null unique, created_at timestamptz default now());
GRANT ALL ON vehicle_names TO postgres, anon, authenticated, service_role;
CREATE TABLE IF NOT EXISTS company_bata_rates (id uuid primary key default uuid_generate_v4(), company_id uuid references companies(id) on delete cascade, vehicle_name text not null, rate_per_bata numeric not null, created_at timestamptz default now(), unique(company_id, vehicle_name));
GRANT ALL ON company_bata_rates TO postgres, anon, authenticated, service_role;
```

### One-time setup after SQL runs
1. Settings → Vehicle Names → add standard names (e.g. Innova Crysta, Tempo Traveller)
2. Driver panel → edit each driver → set vehicle name (from list) and default bata_rate
3. Companies → each company → add bata rate overrides per vehicle name if needed

---

## Bata Auto-Computation in Driver App (built 2026-05-22) ✓

Driver app CompletedScreen auto-computes bata count (driver-visible thresholds only):
- **Late night**: closing time > 10:30 PM → +1 bata
- **Early morning**: opening time < 5:30 AM → +1 bata
- **Outstation**: +1 per booking leg (day)
- **Manual additional bata**: driver can add extra bata via number field

Total bata = auto + manual. Sent as `bata_driver` to `/api/driver-app/trips/[id]/complete`.

Key files (driver-app): `src/screens/CompletedScreen.tsx`, `src/screens/ArrivedScreen.tsx` (opening time mandatory), `src/screens/HistoryDetailScreen.tsx` (bata pill in header + per-day breakdown)

Mandatory fields enforced: opening time (ArrivedScreen) + closing time (CompletedScreen) — both show Alert if blank.

---

## SYSTEM STATUS — as of 2026-05-22 (FULLY LIVE ✅) — latest session

System fully running. AI kill switch available in Settings if needed.

**2026-05-22 changes (reimbursements + bata):**
- Built full reimbursements module (web app) — see section above
- Built bata auto-computation in driver app — see section above
- Reports page: added Permit and Bata columns + CSV export
- Booking detail page: shows bata_driver count
- Trip type bata compute: outstation adds 1 per leg, local/airport uses time thresholds only

**2026-05-21 changes (tripsheet closing data + GPS fixes):**
- `src/app/api/driver-status/route.ts`: removed `.is('booking_leg_id', null)` filter (caused silent PostgREST failure after ALTER TABLE); changed `.single()` → `.maybeSingle()` for sheet lookup; added `console.error` logging to all trip_sheets insert/update operations
- `src/app/driver-status/page.tsx`: GPS-mode trip summary now shows whenever `closingKm` is set (was only checking `status === 'completed'` URL param — GPS completions use `status=arrived` URL)
- `src/app/(dashboard)/bookings/[id]/page.tsx`: trip-sheet query auto-refreshes on booking status transition `in_progress → completed`; manual "Refresh" button added to tripsheet section header
- `supabase-schema.sql`: all trip_sheets ALTER TABLE migrations documented as comments
- All trip_sheets ALTER TABLE columns run in Supabase (see SQL migrations section above)

**2026-05-20 changes:**
- Gmail auth switched from OAuth to service account + domain-wide delegation (see `feedback_gmail_service_account.md`)
- Drive backup cron + archive routes REMOVED (user switching to Supabase paid plan) — `GOOGLE_DRIVE_*` env vars removed
- Auto-refresh: `useBookings` hook, today-links, and legs-due queries all poll every 30s
- Guest client linking fixed in `parse-message/route.ts` — `guest_client_id` now set on booking after guest creation (was missing, only WhatsApp had it)

### 2026-05-11 Incident (resolved):
- CC loop caused 802 duplicate bookings + 2302 raw_messages — all deleted via SQL
- Root cause: system was CCing `bookings@jmstravels.net` on its own outgoing replies; that reply landed back in the JMS inbox as a new email; webhook re-processed it → infinite loop
- Fixed permanently: self-email skip + CC strip + historyId advanced before processing

### Vercel env vars (all set ✓):
- `OPERATOR_WHATSAPP_NUMBER` = crash alerts number (webhook crashes, processing failures, Gmail renewal failure)
- `OPS_WHATSAPP_NUMBER` = ops team number (booking notifications, morning digest) — now fallback only; main ops channel is Web Push
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` + `VAPID_SUBJECT` = required for Web Push
- `GOOGLE_MAPS_API_KEY` = Distance Matrix API (daily cap enforced in code — see Maps section)

### Timestamp column names (for SQL queries):
- `raw_messages` → `received_at` (NOT `created_at`)
- `message_logs` → `sent_at` (NOT `created_at`)
- All other tables → `created_at`

---

## Email & WhatsApp Hardening (shipped 2026-05-11) ✓

### Gmail webhook hardening
- Recursive MIME part search (`extractPlainText`) — finds text/plain nested in multipart/mixed → multipart/alternative
- HTML-to-text fallback (`extractHtmlText`) — HTML-only emails now parsed
- Self-email skip — any email FROM `bookings@jmstravels.net` is skipped (prevents CC loop)
- CC strip — own address filtered out of all outgoing reply CC lists
- historyId advanced BEFORE `history.list` call — prevents double processing when our own sent email triggers a second Pub/Sub notification

### Gemini safety
- `extract.ts`: JSON.parse wrapped in try-catch; returns safe "all fields missing" default on bad response
- `classify.ts`: JSON.parse wrapped in try-catch + validation of classification value; returns 'unclassified' on bad response

### Booking intake hardening (`parse-message/route.ts`)
- Junk pre-filter: regex catches auto-replies, OTPs, bank alerts, newsletters BEFORE calling Gemini (saves AI cost)
- Auto-created email clients now get `company_id` by matching sender domain to `companies.email_domains` — fixes approval bypass on first booking from new sender
- Dead letter: on any processing error, `raw_messages.ai_classification` set to `'processing_failed'` + operator WhatsApp alert sent
- Operator notified on EVERY new booking (email + WhatsApp channel) with ref, date, pickup, status

### Operator alerting (`src/lib/utils/notify-operator.ts`) — updated 2026-05-13
- `notifyOperator(message, channel?)` — channel is `'alerts'` (default) or `'ops'`
- `'alerts'` → Web Push to all subscribed browsers **+** WhatsApp to `OPERATOR_WHATSAPP_NUMBER` (crashes, failures, Gmail renewal fail)
- `'ops'` → Web Push only (new bookings, morning digest, rate limit hits, duplicate blocks, client cancels) — no WhatsApp cost
- Gracefully no-ops if VAPID env vars not set (logs to console instead)
- `change-handler.ts` uses `'ops'` channel for all cancel/modify operator notifications

### WhatsApp async processing (shipped 2026-05-11) ✓
- `after()` from `next/server` defers all Gemini/Supabase/WA work until after 200 is returned
- Meta's 20s webhook timeout is no longer a failure risk
- `processWebhook(body)` function extracted from POST handler — POST now just parses body + schedules work
- Key file: `src/app/api/webhooks/whatsapp/route.ts`

### Morning digest + auto-chase (renew-gmail-watch cron, 8:30am IST daily)
- Gmail watch renewal: alerts operator if renewal fails (watch expires in 7 days if unrenewed)
- Auto-chase: finds all `pending_approval` bookings older than `company.approval_timeout_hours` → fires chase-approval for each
- Morning digest WhatsApp to operator: new bookings last 24h, pending approvals list, confirmed bookings today/tomorrow with no driver, failed message count

### Other fixes
- `approval-handler.ts`: `.maybeSingle()` on booking lookup, logs WA notification failure
- `fill-missing.ts`: email errors logged instead of silently swallowed
- `send-ack/route.ts`: status check fixed (`complete` not `awaiting_ack`)

---

## Web Push Notifications (shipped 2026-05-13) ✓

Replaced WhatsApp ops alerts with free browser push notifications to reduce messaging costs.

### Architecture
- `push_subscriptions` table: `endpoint, p256dh, auth, user_label` — GRANT applied ✓
- `src/lib/utils/push-notify.ts` — `sendPushToAll(title, body, url)`: sends to all subscribed browsers, auto-removes expired subscriptions (410/404)
- `src/app/api/push/subscribe/route.ts` — POST upserts subscription by endpoint; DELETE removes it
- `src/components/layout/PushSubscribeButton.tsx` — bell icon in Header: states = unsupported/loading/granted/denied/default
- `public/sw.js` — push + notificationclick handlers (shows notification, focuses/opens window on click)
- VAPID keys: one-time generated. PUBLIC key = `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, private = `VAPID_PRIVATE_KEY`, subject = `VAPID_SUBJECT`

### Channel routing
- `'ops'` → push only (new bookings, rate limit hits, duplicate blocks, client cancels, morning digest)
- `'alerts'` → push + WhatsApp (circuit breaker, Gmail crash, processing failure)
- `OPS_WHATSAPP_NUMBER` env var is now unused but harmless to leave

---

## Google Maps Daily Quota Cap (shipped 2026-05-13) ✓

GCP free trial doesn't allow console quota adjustments — cap enforced in code instead.

- `MAPS_DAILY_LIMIT = 200` constant in `src/app/api/driver-status/route.ts`
- Counter stored in `app_settings` as key `maps_daily_count_YYYY-MM-DD` (IST date)
- Checked before every Distance Matrix API call; incremented after successful call
- If limit reached: returns `null` (distances show as blank in tripsheet) + `console.warn`
- Operator is NOT alerted on limit hit (just skips silently — not a critical failure)

---

## Bug Fixes (2026-05-13 session) ✓

### `approve/route.ts` (clickable email link approval)
- Added `source`, `guest_name`, `guest_phone`, `client.primary_email` to booking select
- Client now notified on **rejection** too (previously silent)
- Email-source bookings get email notification; WhatsApp bookings get WhatsApp — consistent with rest of codebase
- Removed unused `NextResponse` import

### `approval-handler.ts` (APPROVE/REJECT/CANCEL via WhatsApp/email reply)
- Extended regex to support `CANCEL BK-xxx` pattern
- CANCEL path: updates booking to cancelled, logs history, notifies operator, sends ack to sender
- Added email notification to `client.primary_email` on approval (email-source bookings)
- `CANCELLABLE_STATUSES = ['draft', 'confirmed', 'pending_approval', 'pending']`

### Ambiguous FK fixes (all `company:companies(*)` → `company:companies!company_id(*)`)
- `src/app/api/webhooks/gmail/route.ts` — line ~212 client lookup
- `src/app/api/webhooks/whatsapp/route.ts` — 3 places (lines ~82, ~759, ~775)
- `src/lib/conversation/process.ts`

### Other fixes
- `fill-missing.ts`: added `message_logs` + `booking_status_history` inserts on every reply
- `renew-gmail-watch/route.ts`: morning digest count fixed (`failedCount` not `failedMessages`)
- `chase-approval/route.ts`: raw `approvalLink()` calls replaced with `createShortLink()`
- `substitute/route.ts`: same — driver status links now go through `createShortLink()`
- `cancel/route.ts`: source-aware notification (email-source → email + optional WA to guest; WA-source → WA-first)

---

## Email Cancel/Modify Flow (shipped 2026-05-14) ✓

Full email-based cancel and modify handling now live.

### Key fixes applied (2026-05-14)
- **Subject to Gemini**: `Subject: ...` prepended to rawContent in gmail/route.ts so Gemini sees subject line
- **gmail_thread_id always saved** on all email bookings (not just missing-field ones) — enables cancel/modify lookup via thread
- **isCancelOrModify guard**: prevents `fillMissingFromReply` from running when cancel/modify keywords detected in email body/subject
- **allCcEmails**: To-header extra recipients merged with CC list and forwarded on all replies
- **fmtValue null-guard** in `handle-change.ts` AND `change-handler.ts`: validates format with regex before calling formatTime12h/formatDate
- **flags array cleared** in both WhatsApp and email handlers when modified fields resolve missing flags
- **findBookingForCancelModify** in `parse-message/route.ts`: lookup order = ref → gmail_thread_id → single active → disambiguation prompt
- `isCancelOrModify` regex covers: cancel/called off/not required/not needed/no longer require/withdraw/scratch that/trip cancelled/reschedule/postpone/modify/change the/update booking/push booking/shift booking/earlier time/later time/different date

### Key files
- `src/app/api/webhooks/gmail/route.ts` — subject extraction, allCcEmails merge, isCancelOrModify guard
- `src/app/api/ai/parse-message/route.ts` — findBookingForCancelModify + cancel/modify handler block
- `src/lib/email/handle-change.ts` — handleEmailCancel + handleEmailModify (fmtValue fix, flags clearing)
- `src/lib/email/fill-missing.ts` — gmail_thread_id always kept (not cleared when fields complete)
- `src/lib/gemini/prompts.ts` — Examples 3-7 added for cancel/modify/enquiry Gemini classification

---

## Google Drive Backup — REMOVED (2026-05-20) ✓

Drive backup cron was removed. User switched to Supabase paid plan for backups.

**Deleted files:** `src/app/api/cron/backup/route.ts`, `src/app/api/admin/archive-backup/route.ts`, `src/app/api/admin/archive-delete/route.ts`

**vercel.json** now has only ONE cron: `/api/cron/renew-gmail-watch` at `0 3 * * *` (daily 3am UTC)

**Removed env vars:** `GOOGLE_DRIVE_BACKUP_FOLDER_ID` (was in Vercel — no longer needed)

---

## 4 Missing DB Indexes Added (2026-05-14) ✓

Run these in Supabase SQL Editor if not yet applied:
```sql
create index if not exists idx_raw_messages_received_at on raw_messages(received_at);
create index if not exists idx_raw_messages_ai_classification on raw_messages(ai_classification);
create index if not exists idx_raw_messages_processed on raw_messages(processed);
create index if not exists idx_bookings_gmail_thread_id on bookings(gmail_thread_id);
```

---

## Email Booking Flow Improvements (shipped 2026-05-08) ✓

### Source-based notification routing
- `booking.source === 'email'` → confirmation only via email (no WhatsApp to booker)
- Driver assignment → email (with CC) + WhatsApp to guest if guest phone available
- `booking.source !== 'email'` (WhatsApp/manual) → original WhatsApp-first logic unchanged
- Key files: `src/app/api/bookings/[id]/confirm/route.ts`, `src/app/api/bookings/[id]/assign/route.ts`

### Email formatting fixes
- RFC 2047 Base64 `encodeSubject()` in `src/lib/gmail/send.ts` — prevents em dash / Unicode corruption in subjects
- Greeting changed to "Hi" everywhere (was "Dear")
- Subject format: `Booking Confirmed - BK-XXXX` with space-dash-space (no em dash)
- `sendEmail()` now returns `Promise<string | null>` (Gmail message ID) instead of `Promise<void>`
- CC recipients forwarded on all outbound email replies from booking confirm/assign routes

### Email reply threading
- `sendEmail` accepts `replyToThreadId` + `inReplyToMessageId` params
- Sets `In-Reply-To` + `References` headers and passes `threadId` to Gmail API → keeps replies in same thread

---

## `requested_by` field on bookings (shipped 2026-05-08) ✓
- `bookings.requested_by text` column records which email or WhatsApp number sent the booking
- WhatsApp webhook sets `requested_by = senderPhone`
- parse-message sets `requested_by = senderEmail` for email channel
- Shown in Booking Info card (hidden when null) — `src/app/(dashboard)/bookings/[id]/page.tsx`

---

## Multi-booking extraction from single email (shipped 2026-05-08) ✓

### Gemini response format change
- Old: flat `{ extracted: {...}, missing_mandatory: [...] }`
- New: `{ bookings: [{ extracted, missing_mandatory, is_guest_booking }], resolved_keywords, new_keyword_detected, confidence }`
- Backwards-compat: if Gemini returns old flat format, `extractBookingFields()` wraps it in `bookings[]`

### parse-message multi-booking loop
- Loops through `extraction.bookings[]` — creates one DB record per booking entry
- Each booking gets its own booking_ref, missing-info email (if needed), or confirmation
- Guest auto-creation runs per booking entry
- `buildMultiBookingEmailBody()` for single email summarising all confirmed bookings

### Key files
- `src/lib/gemini/extract.ts` — updated `ExtractionResult`, `ExtractedBooking` interfaces + normalisation
- `src/lib/gemini/prompts.ts` — EXTRACTION_PROMPT with MULTIPLE BOOKINGS RULE + Licious + Joe Sir few-shot examples
- `src/app/api/ai/parse-message/route.ts` — multi-booking loop

---

## Guest auto-creation in parse-message and process.ts (shipped 2026-05-08) ✓
- When `extraction.extracted.guest_name` is present, checks if guest exists by phone
- If not found: inserts new `clients` row with `client_type: 'guest'`, `guest_of_company_id` (from booker's company), `is_verified: false`
- Added to `src/app/api/ai/parse-message/route.ts` AND `src/lib/conversation/process.ts`
- WhatsApp webhook already had this — now consistent across all intake channels

---

## Email reply thread matching — fill-missing.ts (shipped 2026-05-08) ✓

### Flow
1. parse-message stores `gmail_thread_id` on draft bookings that have missing mandatory fields (email channel only)
2. Gmail webhook checks each incoming message's `threadId` against `bookings.gmail_thread_id` where `status = 'draft'`
3. Match found → calls `fillMissingFromReply()` → skips normal parse-message flow
4. `fillMissingFromReply()` re-extracts from reply, merges with existing booking (existing non-null takes priority), removes satisfied flags
5. Still missing → sends follow-up email in same thread (with In-Reply-To threading)
6. All complete → checks approval_required → sends confirmation email in same thread
7. `gmail_thread_id` cleared on booking once all fields satisfied

### Key files
- `src/lib/email/fill-missing.ts` — NEW: `fillMissingFromReply()` function
- `src/app/api/webhooks/gmail/route.ts` — extracts `rfcMessageId` (Message-ID header) + `gmailThreadId` (msg.threadId cast), checks for draft booking match before normal flow

### SQL migration needed
```sql
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS gmail_thread_id text;
CREATE INDEX IF NOT EXISTS idx_bookings_gmail_thread_id ON bookings(gmail_thread_id) WHERE gmail_thread_id IS NOT NULL;
```

---

## Assign Driver UI — mismatched vehicles (shipped 2026-05-08) ✓
- `getMismatchReasons(driver)` checks vehicle_type and seating_capacity against booking requirements
- Drivers split into `eligible` (green) and `ineligible` (amber "Does not match criteria" section)
- Amber section has orange Assign button + second ConfirmDialog warning about mismatch
- Key file: `src/components/bookings/AssignDriverModal.tsx`

---

## WhatsApp Prompt Improvements (2026-05-08 session) ✓

### prompts.ts — EXTRACTION_PROMPT additions
- "👆" now lists text alternatives: "as above", "refer above", "see above", "check above", "above location", "location above", "above address", "above map", "that location", "that address", "same as above", "^"
- Down-pointer phrases added: "check below", "will send", "sending now" to continuation signals
- Detail-pending continuation: "will share details later", "will share flight details", "details to follow"
- service_type="return" expanded: "drop back", "drop him/her/them back", "drop to his/her house/home/residence/office" (when final drop = same type as pickup)
- guest_name rule: ministry/department after guest name (e.g. "Dr. Om Krishnan, Meity") → Meity goes to special_instructions, NOT guest_name
- special_instructions rule: explicit end times ("till 1800 hrs" → "Vehicle required till 18:00"), conditional follow-up instructions ("check with him whether he needs vehicle on [date]")

### prompts.ts — CONVERSATION_PROMPT additions
- Same "👆" text alternatives added to LOCATION KEYWORDS section
- service_type="return" rule added to LOCAL trip section (same signals as EXTRACTION_PROMPT)
- Detail-pending continuation signals added
- Guest ministry affiliation rule added to GUEST BOOKINGS section
- special_instructions guidance: end times + conditional follow-ups

### route.ts — Bulk escalation (new)
When 3+ distinct guest phone numbers appear across the full conversation, the bot sends:
> "Hi [name], we've received multiple booking requests — thank you! Our team will review each one and confirm individually. For urgent assistance, please call 9845572207."
...then closes the session. Admin creates bookings manually from raw messages in dashboard.
Detection: `uniqueGuestPhones.size >= 3` (excludes sender's own phone).

### route.ts — name+pointer detection expanded
`rawContent.includes('👆')` → replaced with `UP_POINTER` regex that also catches text alternatives like "as above", "refer above", "see above", etc.

---

## Pending features (not yet built)

### Merge classify + extract into one Gemini call
- Currently: 2 Gemini calls per message (classify → extract) — saves ~40-50% AI cost on email channel
- Not yet built

### UI Redesign — Stitch design system (IN PROGRESS 2026-05-06)
Design source: Google Stitch-generated HTML (Material Design 3-inspired)
Design system:
- **Colors**: primary `#003fb1` (blue-700), sidebar white, header white, bg `#FAF8FF`
- **Active nav**: `bg-blue-50 text-blue-700 border-r-4 border-blue-700`
- **Cards**: `bg-white rounded-xl border border-gray-200`
- **Typography**: Inter, label-caps = 11px uppercase tracking-wide font-bold
- **Icons**: Lucide (keep existing)

Already done ✓:
- Sidebar: white bg, blue active border-r-4, logo + "Fleet Ops" subtitle — `src/components/layout/Sidebar.tsx`
- Header: fixed top bar with notifications + user avatar — `src/components/layout/Header.tsx` (NEW)
- MobileNav: updated colors — `src/components/layout/MobileNav.tsx`
- Layout: `md:pl-64 pt-16` padding — `src/app/(dashboard)/layout.tsx`
- Latest commit: `08208f5`

Still to do (resume here):
- `/clients` page — table with avatar initials, company badge, status dot, profile sidebar panel
- `/companies` page
- `/drivers` page
- `/` dashboard home
- `/messages`, `/reports`, `/settings`
- Button-level role gating (viewer/operator/admin on action buttons)

### Gmail intake (shipped 2026-05-06) ✓
- Fully connected: Gmail push notifications → Pub/Sub → `/api/webhooks/gmail` → `/api/ai/parse-message`
- Watch renewed daily at 3am IST via cron (`/api/cron/renew-gmail-watch`) — 7-day expiry handled automatically
- `parse-message` handles both `whatsapp` and `email` channels — same Gemini classify+extract pipeline
- Email flow: decode Pub/Sub base64 → fetch full Gmail message via history API → check approval reply → insert `raw_messages` → call parse-message → create booking → send email ack
- Missing fields → email reply using `MISSING_INFO_REQUEST` template
- Complete booking → email ack using `BOOKING_RECEIVED` template via `sendEmail()`
- Key files: `src/app/api/webhooks/gmail/route.ts`, `src/app/api/cron/renew-gmail-watch/route.ts`, `src/app/api/ai/parse-message/route.ts`, `src/lib/gmail/send.ts`
- Env vars needed: `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`, `GOOGLE_PUBSUB_TOPIC`, `CRON_SECRET`

### Button-level role gating
- `useCanEdit()` / `useIsAdmin()` hooks exist but action buttons not yet gated in UI
- Viewer role enforcement is API-level only for now

---

## Auto Client Onboarding (shipped 2026-04-30) ✓
1. Known client → session-based conversation flow
2. Unknown sender awaiting onboarding reply → create client + company, say "profile set up, what cab?"
3. Unknown sender first message with name → auto-create client, start session
4. Unknown sender first message no name → ask "who are you?", mark `awaiting_client_info`
