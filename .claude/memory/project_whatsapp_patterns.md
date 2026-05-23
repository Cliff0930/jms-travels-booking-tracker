---
name: WhatsApp booking message patterns
description: Real WhatsApp booking patterns from CDAC and corporate coordinators — extraction rules, multi-booking signals, bulk escalation
type: project
originSessionId: d6987581-4c96-4d64-aecf-2d01c5fc1a92
---
## Coordinator booking patterns (from real CDAC samples)

### Single-message booking with full day + return
> "Need a vehicle for full day for Dr. Venugopal, 8050629505 pick up from his residence at 09 00 am from his residence and visit LRDE and evening drop to his house. CDAC TVM billing."

- "full day" + "evening drop to his house" = service_type=return, trip_type=local
- "his residence" as pickup = accepted as-is (no saved location needed)
- "CDAC TVM billing" = company_mentioned (TVM = Trivandrum office)
- No date mentioned → pickup_date goes to missing_mandatory

### Ministry affiliation after guest name
> "Dr. Om Krishnan, Meity, 90151 70278"

- "Meity" = Ministry of Electronics and IT — NOT part of guest_name
- guest_name = "Dr. Om Krishnan", guest_phone = "9015170278"
- "Meity" → special_instructions: "Guest: Dr. Om Krishnan, Meity"

### Multiple guests on same flight (same message)
> "Mr. Naveen 9868428660 arr tomorrow 29.4.2026 at 1225 by AI 2415 Terminal 2... He will required again vehicle on 30.4.2026 morning 0830 am till night airport drop."

- Two bookings for same guest: (1) airport arrival 29/4, (2) full day + airport drop 30/4
- "till night airport drop" on second booking = trip_type=airport for that day
- "ask the driver to check the morning reporting time" → special_instructions

### Explicit end time (not a drop)
> "till evening 1800 hrs vehicle required"

- This is an end time, NOT a drop_location or new booking
- Goes to special_instructions: "Vehicle required till 18:00"

### Conditional future booking (NOT a booking)
> "Check with him whether he needs vehicle for 30.4.2026 Morning"

- This is a follow-up instruction, NOT a confirmed booking
- Goes to special_instructions: "Follow up with [name] re: 30 Apr vehicle requirement"

### Detail-pending signal
> "I will share the flight details little later"

- Continuation signal — do NOT add missing fields to missing_mandatory
- Acknowledge and wait

### Pre-booking with vehicle types only
> "In addition to the above Tomorrow i will require One Innova crysta and One etios. I will share the flight details little later."

- Vehicle type specified, no guest/pickup/time yet
- Treat as continuation signal — acknowledge and wait for details

---

## Bulk coordinator escalation rule

When 3+ distinct guest phone numbers appear across the full conversation, the webhook bypasses Gemini and sends:
> "Hi [name], we've received multiple booking requests — thank you! Our team will review each one and confirm individually. For urgent assistance, please call 9845572207."

**Why:** Our conversation system creates ONE booking per session. Bulk coordinator messages (e.g. 5 messages, 6 guests, 8 bookings) cannot be auto-processed reliably. Admin creates bookings manually from raw messages in dashboard.

**How to apply:** This is already implemented in route.ts. The threshold (3 unique guest phones) was chosen because normal single bookings have 0–2 phones max.

---

## Pointer emoji text alternatives (for prompt + webhook)

👆 text alternatives: "as above", "refer above", "see above", "check above", "above location", "location above", "above address", "above map", "that location", "that address", "same as above", "^"

👇 text alternatives: "check below", "will send", "sending now"

Webhook UP_POINTER regex: `/👆|as above|refer above|see above|check above|above location|location above|above address|that location|that address|same as above|\^/i`
