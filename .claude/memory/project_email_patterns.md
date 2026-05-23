---
name: Corporate email booking patterns
description: Real email formats used by corporate clients (e.g. Licious) for booking requests
type: project
originSessionId: 513de91c-d84e-4cea-8466-48b2f2825afe
---
## Structured corporate booking email (confirmed working pattern)

Sender: coordinator from company domain (e.g. kallumari.tarun@licious.com)
Approval reply: separate email from approver (e.g. bikram@licious.com) saying "Approved"

**Format:**
```
Hello Madhu & Sachin
Please make the following booking
Name: Tarun, Satish
1st Pickup location: Ejjipura bustop
Contact number: 7619219969
Date: 8th May
Department - R&D
Drop Location: Licious PC - Hoskote.
Purpose: Plant Trail
Pickup time - 8.00 AM
@Sathish Raja @Bikram Pal please do the approval
```

**Extraction rules confirmed:**
- "Name: X, Y" → two travelers → pax_count=2, guest_name="Tarun, Satish"
- "Contact number:" → guest_phone
- "1st Pickup location:" → pickup_location (ignore ordinal prefix)
- "Department" / "Purpose" → special_instructions
- @mentions and approval lines → ignored
- Approval email ("Approved") from bikram@licious.com → triggers approval flow

**Why:** Added as few-shot example to EXTRACTION_PROMPT in prompts.ts on 2026-05-08.
**How to apply:** When adding more examples to prompts, follow this pattern of showing real message + exact expected JSON output + notes explaining the rules.

---

## Multi-trip email (Joe Sir pattern — confirmed working)

Single email with two distinct trips → two booking records.

**Format:**
```
Hi, I need cabs for Joe Sir as below:
1. 11 May - Flight AI302 - Pickup Airport @ 6am, Drop Indiranagar
2. 13 May - Pickup Indiranagar @ 4pm, Drop Airport - Flight AI305
```

**Extraction rules confirmed:**
- Two separate date+time+location combos → `bookings: [booking1, booking2]`
- "Airport" pickup/drop → `trip_type: 'airport'`
- Flight number → goes in `special_instructions`, not a separate field
- "Drop Airport" and "Pickup Airport" correctly identify direction (arrival vs departure)
- Guest name from context ("Joe Sir") → `guest_name`

**Why:** Added as second few-shot example to EXTRACTION_PROMPT on 2026-05-08 to teach multi-booking splitting.
