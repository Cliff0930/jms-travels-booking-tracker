---
name: project-driver-app-plan
description: "JMS Driver native app — built and deployed. React Native + Expo, Android APK with OTA updates. Last updated 2026-05-23."
metadata: 
  node_type: memory
  type: project
  originSessionId: 1ee64c17-2b4c-4ede-a7b9-4300c1ed1afb
---

**STATUS: LIVE — 10 screens, all feature-complete as of 2026-05-23**

Native Android app is live. APK sent to drivers via WhatsApp.

## Repo & Expo
- **Repo:** `/Users/sami/Documents/JMS Travels Booking Tracker/driver-app/`
- **Expo account:** `jmstravelprabhu`
- **EAS project:** `@jmstravelprabhu/jms-driver` (ID: `056f057d-d216-4b02-a6fc-0681dceeb9e7`)
- **Latest APK:** `https://expo.dev/artifacts/eas/tsQobXWSBe1Y8RR8G7VnCE.apk`
- **OTA channel:** `preview` (NOT `main` — APK listens to `preview` branch)
- **OTA command:** `cd driver-app && npx eas-cli update --branch preview --message "..."`

## Screens (10 total)
Design tokens: primary #022448, tertiaryFixed #ffddb8, background #f6fafe.
All screens use SafeAreaView from react-native-safe-area-context.

1. **Login** — deep blue bg, white card, amber login button
2. **Home (Today)** — trip card with guest name + VIP badge, call button, Maps buttons for pickup/drop, special instructions amber note, MARK ARRIVED / TRIP IN PROGRESS action buttons
3. **Mark Arrived** — hero card with guest name + VIP badge + call + Maps button, opening KM, tripsheet #, TimePicker, GPS status strip
4. **Active Trip** — ON DUTY pill, live timer (initialised from manual_opening_time so survives app switching), guest strip with VIP badge + call button, stats row, route connector with Maps buttons, tripsheet strip
5. **Mark Completed** — trip ref card, closing KM with opening KM reference + distance preview + orange warning if close < open, TimePicker, expenses (₹ inputs), bata section
6. **Upcoming** — trip cards with date badge (amber = today/tomorrow), route connector, taps to UpcomingDetail
7. **Upcoming Detail** — full detail view: pickup time, trip type badge, route with Maps buttons, passenger with VIP badge + call, special instructions, multi-day legs, booking ref strip
8. **History** — filter chips (all/today/yesterday/week/month), search (ref/guest/location/tripsheet number — numeric-only match strips prefix), cards with stats grid + tripsheet # tag + trip type tag
9. **History Detail** — bento stats grid (KMs side-by-side, times side-by-side in AM/PM, total distance highlight, total duration from driver's manual times only, tripsheet # for single-day), expenses, bata card, per-day breakdown for multi-day
10. **Profile** — availability toggle (Switch → API), activity summary stats (total trips / this week / bata this week), Full Name + Phone info cards, Your Vehicle card (vehicle_name, vehicle_number, vehicle_type, vehicle_color), driver status banner, app version, logout

## Bottom Tab Navigation
4 tabs: Today | Upcoming | History | Profile
Tab bar height uses `useSafeAreaInsets().bottom` to avoid Android nav bar overlap.

## Backend APIs (all live at booking.jmstravels.net)
- `POST /api/driver-app/auth/login` — phone + PIN → JWT token
- `GET  /api/driver-app/trips/today` — includes special_instructions, VIP join (clients!guest_client_id)
- `GET  /api/driver-app/trips/upcoming` — same fields + booking_legs
- `GET  /api/driver-app/trips/history` — includes trip_type, guest_phone
- `POST /api/driver-app/trips/[id]/arrive`
- `POST /api/driver-app/trips/[id]/complete`
- `POST /api/driver-app/trips/[id]/gps`
- `GET  /api/driver-app/driver/availability` — returns `{ available: bool }`
- `POST /api/driver-app/driver/availability` — sets `is_available` on drivers table
- `GET  /api/driver-app/driver/profile` — returns vehicle_name, vehicle_number, vehicle_type, vehicle_color
- `POST /api/drivers/[id]/set-pin` — operator sets driver PIN from CabFlow UI

## Auth
- PIN hash: `sha256(phone:pin:DRIVER_APP_SECRET)` stored in `drivers.pin_hash`
- Token: custom HMAC-SHA256 JWT, 1 year expiry
- Login tries all phone formats: bare, 91 prefix, +91 prefix

## DB migrations required (Supabase SQL editor)
```sql
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS pin_hash text;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS push_token text;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS is_available boolean DEFAULT true;
ALTER TABLE trip_sheets ADD COLUMN IF NOT EXISTS bata_driver integer;
```
**`is_available` may still be pending** — needed for availability toggle in Profile.

## Key technical decisions / bug fixes
- **Duration always uses manual times** — `manual_opening_time`/`manual_closing_time` only. System timestamps (`opening_time`/`closing_time`) are for GPS audit only, not shown.
- **VIP data via PostgREST join** — `clients!guest_client_id(is_vip, designation)` in today + upcoming routes; flattened to `is_vip` and `guest_designation` in response.
- **Tripsheet search** — strips non-digits from both stored number and query, so "2000" matches "TS-2000".
- **Timer accuracy** — `parseOpeningElapsed(manual_opening_time)` initialises timer so it survives app-switching.
- **OTA `isEmbeddedLaunch` guard removed** — was preventing OTA-to-OTA updates. `try/catch` alone handles dev mode.
- **SafeAreaProvider** wraps root in App.tsx for correct insets on all devices.

## OTA update history
| Date       | Update group ID                        | Message |
|------------|----------------------------------------|---------|
| 2026-05-22 | `076aae4c-5ffb-4e3f-96ab-416b4d9d4370` | Bata auto-compute, mandatory opening/closing time |
| 2026-05-23 | `253e8a11-edc3-4c85-a968-62bc280bf0ee` | Vehicle details in Profile, VIP guest badge, trip type in History |
| 2026-05-23 | `ba747ad3-9c1b-4dc0-a497-86a9b34b9523` | History: side-by-side stats, AM/PM times, duration, tripsheet number + search |
| 2026-05-23 | `4a099b58-42c3-4161-afb3-7bc9fd5c18df` | Fix duration: use driver manual times only, not system timestamps |

## What drivers do NOT see
- GPS KM (operator only)
- Client billing rate / JMS margin
- Any price or billing information

## Parked for later
- Push notifications for new booking assignment
- Pay & billing view (needs billing module first)
- iOS App Store ($99/year, skip if all drivers Android)
