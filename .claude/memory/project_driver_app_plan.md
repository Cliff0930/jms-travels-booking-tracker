---
name: project-driver-app-plan
description: "JMS Driver native app — built and deployed as of 2026-05-21. React Native + Expo, Android APK with OTA updates."
metadata: 
  node_type: memory
  type: project
  originSessionId: db19ada5-d933-4300-8122-290e75d741ea
---

**STATUS: BUILT AND DEPLOYED — latest OTA: 2026-05-22**

Native Android app is live. APK sent to drivers via WhatsApp.

## What was built

**Repo:** `/Users/sami/Documents/JMS Travels Booking Tracker/driver-app/`  
**Expo account:** `jmstravelprabhu`  
**EAS project:** `@jmstravelprabhu/jms-driver` (ID: `056f057d-d216-4b02-a6fc-0681dceeb9e7`)  
**Latest APK:** `https://expo.dev/artifacts/eas/tsQobXWSBe1Y8RR8G7VnCE.apk`

## Screens (all built)
1. Login — phone number + PIN (4-6 digits)
2. Home — today's assigned trip card + Mark Arrived button
3. Mark Arrived — tripsheet #, opening KM, time
4. Active Trip — GPS tracking indicator, Mark Completed button
5. Mark Completed — closing KM, time, toll, parking, permit, bata (auto-computed: late night >10:30 PM +1, early morning <5:30 AM +1, outstation +1/day; manual additional field)
6. Upcoming — list of future bookings assigned to this driver
7. History — list of completed trips, tap for detail
8. History Detail — shows only what driver manually entered (no GPS KM, no billing)

## Backend APIs (all live at booking.jmstravels.net)
- `POST /api/driver-app/auth/login` — phone + PIN → JWT token (1 year expiry)
- `GET /api/driver-app/trips/today`
- `GET /api/driver-app/trips/upcoming`
- `GET /api/driver-app/trips/history`
- `POST /api/driver-app/trips/[id]/arrive`
- `POST /api/driver-app/trips/[id]/complete`
- `POST /api/driver-app/trips/[id]/gps`
- `POST /api/drivers/[id]/set-pin` — operator sets driver PIN from CabFlow driver panel

## Auth approach
- PIN-based — no SMS/OTP cost
- PIN hash stored as `sha256(phone:pin:DRIVER_APP_SECRET)` in `drivers.pin_hash`
- Token: custom HMAC-SHA256 JWT, 1 year expiry, signed with `DRIVER_APP_SECRET`
- Login tries all phone formats: bare (8892...), 91 prefix (918892...), +91 prefix — handles any format driver enters

## DB changes required (run in Supabase SQL editor)
```sql
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS pin_hash text;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS push_token text;
ALTER TABLE trip_sheets ADD COLUMN IF NOT EXISTS bata_driver integer;
```

## Setting driver PIN (from CabFlow UI)
Drivers page → click driver → scroll to green "Driver App" section → Set PIN button → enter 4-6 digit PIN → Save

## OTA updates (expo-updates configured)
- Drivers get JS updates automatically on next app open — no reinstall needed
- To push an update: `cd driver-app && eas update --branch main --message "describe change"`
- Only new native packages or app.json changes require a new APK build

### OTA history
| Date | Update group ID | Message |
|------|----------------|---------|
| 2026-05-22 | `076aae4c-5ffb-4e3f-96ab-416b4d9d4370` | Bata auto-compute, mandatory opening/closing time |

## Dual mode — app + web link coexist
- Drivers with app: open app, see today's trip automatically
- Drivers without app (or iOS): receive existing WhatsApp short link, use web form in browser
- Both write to same Supabase DB, operator sees status in CabFlow either way

## What drivers do NOT see
- GPS KM (only operator sees this)
- Route map images
- Client billing rate / JMS margin
- Any price or billing information

## What's parked for later
- Pay & billing view (needs billing module first — rate cards, driver rates)
- Push notifications for new booking assignment
- iOS App Store ($99/year, skip if all drivers Android)
- Google Play Store ($25 one-time, not needed for WhatsApp sideload)

## Tech stack
- React Native + Expo SDK 54 (managed workflow)
- expo-location — background GPS (distanceInterval: 300m, timeInterval: 90s)
- expo-updates — OTA updates via EAS Update channel "preview"
- expo-notifications — placeholder, not yet wired to booking assignment
- AsyncStorage — stores session token + active booking ID for background GPS task
- TaskManager — GPS background task posts to /api/driver-app/trips/[id]/gps

**How to apply:** When resuming driver app work, open `/driver-app` folder. Use `npx eas-cli update` for JS changes. Rebuild APK only for native changes.
