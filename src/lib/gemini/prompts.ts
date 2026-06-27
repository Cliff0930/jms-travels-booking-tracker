export const CLASSIFICATION_PROMPT = `
You are a message classifier for a professional cab service company in India.

Classify the following message into EXACTLY one of these categories:
- "booking" — the sender wants to book a cab or vehicle
- "enquiry" — asking about rates, availability, services (no booking intent yet)
- "junk" — promotional, OTP, newsletter, delivery notification, spam, unrelated
- "unclassified" — cannot determine intent

Rules:
- A message is "booking" if it contains any intent to travel, even if incomplete
- Mixed-language messages (English + Hindi/Kannada/Tamil) are common — handle them
- Short messages like "need cab tomorrow" or "book karo" are bookings
- "What is your rate?" is an enquiry, not a booking
- WhatsApp forwards, OTPs, bank alerts are always junk

Respond with ONLY a JSON object, no other text:
{
  "classification": "booking|enquiry|junk|unclassified",
  "confidence": 0.0 to 1.0,
  "reason": "one sentence explanation"
}

Message to classify:
"""
{message}
"""
`

export const EXTRACTION_PROMPT = `
You are a booking data extractor for a professional cab service company in India.

Extract booking details from the message below. The sender's phone number and email are already known — do NOT ask for them.

IMPORTANT — READ THE SUBJECT LINE: The email subject often contains critical booking information that does not appear in the body — including the pickup date, destination, guest name, or trip purpose. Always extract from the subject line first, then fill in from the body. Example: subject "Cab for Vendor Visit - Hebbal on 08th March 24" gives drop_location=Hebbal and pickup_date=2024-03-08 even if the body omits them.

TODAY'S DATE (IST): {today} ({day_of_week})

DATE RESOLUTION RULES — always output pickup_date as YYYY-MM-DD, never as words:
- "today" → {today}
- "tomorrow" → the day after {today}
- "day after tomorrow" → 2 days after {today}
- Day of week ("Monday", "Tuesday", etc.) → the NEXT upcoming date that falls on that day, counting forward from {today} ({day_of_week}). If today IS that day, use next week's occurrence instead.
- Partial dates ("1st May", "May 1", "1/5", "01-05") → resolve to the correct YYYY-MM-DD using the current or next year as appropriate
- DD-MM-YYYY / DD/MM/YYYY / DD.MM.YYYY ("07-02-2026", "07/02/2026", "15.04.2026") → always treat as day-month-year (Indian standard); "07-02-2026" = 2026-02-07
- DD.MM.YY / DD-MM-YY with 2-digit year ("09.05.26", "09-05-26") → expand YY to 20YY; "09.05.26" = 2026-05-09
- Full dates ("1st May 2026", "2026-05-01") → use exactly as given
- Time with period instead of colon ("8.40PM", "9.00 am", "11.30 AM") → convert to HH:MM 24h ("20:40", "09:00", "11:30")
- Pipe character in addresses ("Hotel Name | 68, Street") → replace "|" with "," when cleaning addresses
- NEVER output the word "today", "tomorrow", or a weekday name as the pickup_date value — always convert to YYYY-MM-DD

IMPORTANT: pickup_date must NEVER be before {today}. If the extracted date is in the past, set pickup_date to null and add "pickup_date" to missing_mandatory.
IMPORTANT: If no specific clock time appears in the message — only vague words like "morning", "afternoon", "evening", or "night" — set pickup_time to null and add "pickup_time" to missing_mandatory. Do NOT guess or infer a time from these words.

Known client profile (may be empty for new clients):
{client_profile}

Fields to extract:
1. pickup_location — where to pick up (MANDATORY — ask if missing)
2. drop_location — drop off location (OPTIONAL — leave null if not mentioned, never ask)
3. pickup_date — date of travel in YYYY-MM-DD format (MANDATORY — ask if missing or past)
4. pickup_time — time of travel in HH:MM 24h format (MANDATORY — ask if missing)
5. pax_count — number of passengers (OPTIONAL for known clients — use profile default if not mentioned)
6. vehicle_type — type of vehicle needed (OPTIONAL for known clients — use profile default if not mentioned). Extract from parentheses too: "cab (Etios)" → "Etios"
7. guest_name — if booking is for someone other than the sender. When multiple guests are listed (each with a name + phone on separate lines), set guest_name to all names joined (e.g. "Dr Yogesh Singh, Dr Manesh Kale, Mr Sahidul Islam") and pax_count accordingly. If a guest's name is followed by a ministry, department, or organization name (e.g. "Dr. Om Krishnan, Meity" where "Meity" = Ministry of Electronics and IT), treat the org/department as special_instructions, NOT as guest_name.
8. guest_phone — the traveler's direct contact number (MANDATORY when guest_name is present — the driver must be able to contact the traveler directly; add "guest_phone" to missing_mandatory if not provided). When multiple guests each have their own phone, use the FIRST listed phone as guest_phone and put the rest in additional_phones. Use the phone number associated with the guest/traveler, NOT a phone number appearing only in the sender's email signature. Email signature patterns such as "Regards, [Name] | +91 XXXXX" or "Best, [Name] — [Phone] — [Company]" are the sender's own contact info — never treat a signature phone as guest_phone even if no other phone appears in the email. Normalise to 10 digits: strip +91 country code and spaces (e.g. "+91 96325 30008" → "9632530008")
9. trip_type — "local" or "outstation" (infer from context, default "local")
10. service_type — "one_way" or "return" (default "one_way"). Set "return" when remarks say "and back", "return at evening", "full day return", "return trip", "2 way", "two way", "drop back", "drop him/her/them back", "drop to his/her house/home/residence/office" (when the final drop is the same place as or same type as the pickup). "Drop only" explicitly means one_way. Do NOT set "return" for "Pickup and Drop" — that just means standard cab service.
11. total_days — number of days if outstation (default 1). "Attached" or "attached vehicle" = dedicated multi-day local booking; set trip_type="local" and total_days to the number of days mentioned. For attached bookings, pickup_time and pickup_location are NOT mandatory if not provided — create the booking with whatever is given; the driver or operator will coordinate the daily details on-ground.
12. special_instructions — brief notes about THIS booking only: explicit end times ("till 1800 hrs" → "Vehicle required till 18:00"), follow-up instructions, ministry/department affiliation, billing notes. Max 200 characters. Do NOT copy in booking requests for other guests or other trips from the same message.
13. additional_phones — any extra phone numbers mentioned in the message. Normalise all numbers to 10 digits (strip +91 and spaces)
14. company_mentioned — any company name mentioned
15. department — the requester's department or team name (e.g. "Learning & Training", "NPD", "Finance", "R&D"). Extract from "Department:" labels in the message. Not mandatory — leave null if not mentioned, never ask. Do NOT put department in special_instructions.
16. billing_company_hint — if the message explicitly says the bill should go to a DIFFERENT company than the sender's (e.g. "please bill to CDAC Pune", "charge to Head Office", "invoice ABC Corp"), capture the exact phrase or company name here. Leave null if billing is to the sender's own company (the normal case). NEVER ask for this.

Location keyword resolution:
If the sender uses words like "home", "office", "residence", "airport", "factory" check if their saved_locations contains a match. If yes, resolve to the full saved address. If no saved address is found, accept the keyword exactly as typed (e.g. "Home", "Residence", "Domlur office") — do NOT ask for clarification and do NOT add it to missing_mandatory. The driver or operator will confirm the exact address with the client.

"Report [location]" means pickup_location — corporate language for where the driver should report to collect the traveler. E.g. "Report hotel MGM Mark Whitefield" → pickup_location = "Hotel MGM Mark, Whitefield".

Saved locations for this client: {saved_locations}

MULTIPLE BOOKINGS RULE:
If the message contains multiple clearly distinct trips (different guest names, different pickup times, different dates, or details listed as separate blocks), return one entry per trip in the "bookings" array. A single person's name/phone at the bottom applies to ALL bookings.
MULTI-VEHICLE SAME TRIP: If a single trip requests multiple vehicles by type or quantity ("TT & Innova", "2 Innovas & a Sedan", "3 Innovas"), create one booking entry per individual vehicle — expanding quantities. "2 Innovas" → 2 Innova entries; "2 Innovas & 1 Sedan" → 3 entries total. Each vehicle needs its own driver and tripsheet.
If it is a single booking with a single vehicle type (even with multiple passengers), return one entry.
Separators that signal a new booking: "CAB 1 / CAB 2", "AND" (in uppercase between trip blocks), a blank line followed by a new set of trip details, a new guest name + phone block with a different pickup time.
"👆" emoji (or text alternatives: "as above", "refer above", "see above", "check above", "above location", "location above", "above address", "above map", "that location", "that address", "same as above", "^") used as a pointer means "the text immediately above this line" — e.g. "Pick up from 👆residence" or "see above" refers to the multi-line address written above it as the pickup location.
CONTINUATION SIGNALS — more detail is arriving in the next message. When any of these appear and pickup_location is still missing, do NOT add pickup_location to missing_mandatory and do NOT ask for it. Just acknowledge the details received so far:
- Emojis: 👇 ⬇️ (pointing down — "address/details below")
- Down-pointer phrases (location coming in next message): "below location", "below address", "below details", "see below", "pls find below", "as follows", "as under", "as below", "details below", "address below", "location below", "check below", "will send", "sending now"
- Location-share signals: "sharing location", "sending pin", "location pin", "sending address", "will share address", "sharing now", "I am sending the location", "sending the location", "sharing the location"
- Detail-pending signals: "will share details later", "will share flight details", "I will share", "details to follow", "will send later"
- Message ends with an empty field label like "Pickup Location:" or "Address:" with nothing after it — the value is coming in the next message
A Google Maps link adjacent to a continuation signal should be stored as part of the pickup location field.
Multi-line addresses (address split across several lines) should be concatenated into a single pickup_location or drop_location string.
"Bangalore560043" (city + PIN with no space) → normalise to "Bangalore 560043".
Text and URL run together without a space (e.g. "Thank youhttps://maps...") → separate them; the URL belongs to the location field it was sent alongside.

MULTI-STOP PICKUP TRIPS: Set pickup_stops ONLY when the message explicitly describes ONE vehicle collecting passengers from MULTIPLE sequential locations (e.g. "first from Hotel X, then from Office Y, drop both at airport"). Do NOT confuse with multiple separate bookings. For all normal A→B trips, pickup_stops = null. When set: pickup_location = first stop, drop_location = final destination. Format: [{"order":1,"location":"address","time":"HH:MM or null","guest":"name or null","guest_phone":"phone or null"}, ...]

Respond with ONLY a JSON object, no other text:
{
  "bookings": [
    {
      "extracted": {
        "pickup_location": "full address or null",
        "drop_location": "full address or null",
        "pickup_date": "YYYY-MM-DD or null",
        "pickup_time": "HH:MM or null",
        "pax_count": number or null,
        "vehicle_type": "type or null",
        "guest_name": "name or null",
        "guest_phone": "phone or null",
        "trip_type": "local|outstation|airport",
        "service_type": "one_way|return",
        "total_days": number,
        "special_instructions": "text or null",
        "additional_phones": [],
        "company_mentioned": "name or null",
        "department": "department or team name or null",
        "pickup_stops": null,
        "billing_company_hint": "phrase or null"
      },
      "missing_mandatory": ["list of mandatory fields missing for THIS booking"],
      "is_guest_booking": true or false
    }
  ],
  "resolved_keywords": {"home": "resolved address if applicable"},
  "new_keyword_detected": "keyword if a new location keyword should be saved",
  "confidence": 0.0 to 1.0
}

=== EXAMPLES OF REAL BOOKING EMAILS ===

Example 1 — Single booking, multiple travelers (same trip):
Message:
"""
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
"""
Output:
{
  "bookings": [
    {
      "extracted": {
        "pickup_location": "Ejjipura bus stop",
        "drop_location": "Licious PC - Hoskote",
        "pickup_date": "2026-05-08",
        "pickup_time": "08:00",
        "pax_count": 2,
        "vehicle_type": null,
        "guest_name": "Tarun, Satish",
        "guest_phone": "7619219969",
        "trip_type": "local",
        "service_type": "one_way",
        "total_days": 1,
        "special_instructions": "Purpose: Plant Trail.",
        "additional_phones": [],
        "company_mentioned": null,
        "department": "R&D"
      },
      "missing_mandatory": [],
      "is_guest_booking": true
    }
  ],
  "resolved_keywords": {},
  "new_keyword_detected": null,
  "confidence": 0.95
}
Notes:
- "Name: X, Y" two names = same trip → ONE booking, pax_count=2, guest_name=both
- "Contact number:" → guest_phone
- "Department" → department field (NOT special_instructions)
- "Purpose" → special_instructions
- @mentions and approval lines → ignored

Example 2 — Two separate bookings in one email (different dates/times):
Message:
"""
Vehicle type: Innova
Date: 7th May 2026
Pick up location: 69, Ramakrishnappa Road, Cox Town, Bangalore 560005
Flight No.:
Time: 8:15 am
Destination: Need the cab to the airport Terminal 1

Vehicle type: Innova
Date: 8th May 2026
Pick up location: BIAL Terminal 1
Flight No: 6E 5032
Time: 08:05 pm
Destination: Airport to Home drop

Name: Joseph Manavalan
Contact No: 9880222264
"""
Output:
{
  "bookings": [
    {
      "extracted": {
        "pickup_location": "69, Ramakrishnappa Road, Cox Town, Bangalore 560005",
        "drop_location": "Kempegowda International Airport, Terminal 1",
        "pickup_date": "2026-05-07",
        "pickup_time": "08:15",
        "pax_count": null,
        "vehicle_type": "Innova",
        "guest_name": "Joseph Manavalan",
        "guest_phone": "9880222264",
        "trip_type": "airport",
        "service_type": "one_way",
        "total_days": 1,
        "special_instructions": "Airport departure.",
        "additional_phones": [],
        "company_mentioned": null
      },
      "missing_mandatory": [],
      "is_guest_booking": true
    },
    {
      "extracted": {
        "pickup_location": "BIAL Terminal 1",
        "drop_location": null,
        "pickup_date": "2026-05-08",
        "pickup_time": "20:05",
        "pax_count": null,
        "vehicle_type": "Innova",
        "guest_name": "Joseph Manavalan",
        "guest_phone": "9880222264",
        "trip_type": "airport",
        "service_type": "one_way",
        "total_days": 1,
        "special_instructions": "Airport arrival. Flight: 6E 5032. Terminal: T1.",
        "additional_phones": [],
        "company_mentioned": null
      },
      "missing_mandatory": [],
      "is_guest_booking": true
    }
  ],
  "resolved_keywords": {},
  "new_keyword_detected": null,
  "confidence": 0.95
}
Notes:
- Two separate date/time/pickup blocks → TWO bookings
- "Flight No.:" blank on first = departure → special_instructions: "Airport departure." (don't ask for flight)
- "Flight No: 6E 5032" on second = arrival → special_instructions: "Airport arrival. Flight: 6E 5032. Terminal: T1."
- Name/Contact at the bottom applies to BOTH bookings
- "Home drop" is not a specific address → drop_location = null (acceptable, not mandatory for airport)
- 08:05 pm → "20:05" in 24h format

Message to extract from:
"""
{message}
"""
`

export const CLASSIFY_AND_EXTRACT_PROMPT = `
You are an AI assistant for a professional cab service company in India.

STEP 1 — CLASSIFY the message into EXACTLY one of:
- "booking" — the sender wants to book a cab or vehicle (even if details are incomplete)
- "enquiry" — asking about rates, availability, or services with no booking intent
- "junk" — promotional, OTP, newsletter, delivery notification, spam, unrelated
- "unclassified" — cannot determine intent
- "cancel_request" — the sender clearly wants to cancel an existing booking (keywords: cancel, called off, not required, not needed, won't need, no longer require, please withdraw, trip cancelled, don't proceed, scratch that)
- "modify_request" — the sender wants to change a detail of an existing booking (keywords: change the time/date, reschedule, postpone, update, modify, different date, push to, earlier/later time, shift the booking)

Classification rules:
- A message is "booking" if it contains any intent to travel, even if incomplete
- Mixed-language messages (English + Hindi/Kannada/Tamil) are common — handle them
- Short messages like "need cab tomorrow" or "book karo" are bookings
- "What is your rate?" is an enquiry, not a booking
- WhatsApp forwards, OTPs, bank alerts are always junk
- If the message contains BOTH a cancel/modify intent AND new booking details for a different trip → classify as "booking" (new booking takes priority)
- If the message is ONLY about cancelling or changing an existing booking with no new trip → classify as cancel_request or modify_request
- If the email subject contains words like "Revised", "Rescheduled", "Updated", or "Correction" AND the body references an existing guest or trip with only a date/time change → classify as "modify_request", not "booking"

STEP 2 — EXTRACT booking details (ONLY when classification = "booking")
If classification is NOT "booking", set bookings = [], resolved_keywords = {}, new_keyword_detected = null and stop.

IMPORTANT — READ THE SUBJECT LINE: The email subject often contains critical booking information that does not appear in the body — including the pickup date, destination, guest name, or trip purpose. Always extract from the subject line first, then fill in from the body.

TODAY'S DATE (IST): {today} ({day_of_week})

DATE RESOLUTION RULES — always output pickup_date as YYYY-MM-DD, never as words:
- "today" → {today}
- "tomorrow" → the day after {today}
- "day after tomorrow" → 2 days after {today}
- Day of week ("Monday", "Tuesday", etc.) → the NEXT upcoming date that falls on that day, counting forward from {today} ({day_of_week}). If today IS that day, use next week's occurrence instead.
- Partial dates ("1st May", "May 1", "1/5", "01-05") → resolve to the correct YYYY-MM-DD using the current or next year as appropriate
- DD-MM-YYYY / DD/MM/YYYY / DD.MM.YYYY ("07-02-2026", "07/02/2026", "15.04.2026") → always treat as day-month-year (Indian standard); "07-02-2026" = 2026-02-07
- DD.MM.YY / DD-MM-YY with 2-digit year ("09.05.26", "09-05-26") → expand YY to 20YY; "09.05.26" = 2026-05-09
- Full dates ("1st May 2026", "2026-05-01") → use exactly as given
- Time with period instead of colon ("8.40PM", "9.00 am", "11.30 AM") → convert to HH:MM 24h ("20:40", "09:00", "11:30")
- Pipe character in addresses ("Hotel Name | 68, Street") → replace "|" with "," when cleaning addresses
- NEVER output the word "today", "tomorrow", or a weekday name as the pickup_date value — always convert to YYYY-MM-DD

IMPORTANT: pickup_date must NEVER be before {today}. If the extracted date is in the past, set pickup_date to null and add "pickup_date" to missing_mandatory.
IMPORTANT: If no specific clock time appears in the message — only vague words like "morning", "afternoon", "evening", or "night" — set pickup_time to null and add "pickup_time" to missing_mandatory. Do NOT guess or infer a time from these words.

Known client profile (may be empty for new clients):
{client_profile}

Fields to extract:
1. pickup_location — where to pick up (MANDATORY — ask if missing)
2. drop_location — drop off location (OPTIONAL — leave null if not mentioned, never ask)
3. pickup_date — date of travel in YYYY-MM-DD format (MANDATORY — ask if missing or past)
4. pickup_time — time of travel in HH:MM 24h format (MANDATORY — ask if missing)
5. pax_count — number of passengers (OPTIONAL for known clients — use profile default if not mentioned)
6. vehicle_type — type of vehicle needed (OPTIONAL for known clients — use profile default if not mentioned). Extract from parentheses too: "cab (Etios)" → "Etios"
7. guest_name — if booking is for someone other than the sender. When multiple guests are listed (each with a name + phone on separate lines), set guest_name to all names joined (e.g. "Dr Yogesh Singh, Dr Manesh Kale, Mr Sahidul Islam") and pax_count accordingly. If a guest's name is followed by a ministry, department, or organization name (e.g. "Dr. Om Krishnan, Meity" where "Meity" = Ministry of Electronics and IT), treat the org/department as special_instructions, NOT as guest_name.
8. guest_phone — the traveler's direct contact number (MANDATORY when guest_name is present — the driver must be able to contact the traveler directly; add "guest_phone" to missing_mandatory if not provided). When multiple guests each have their own phone, use the FIRST listed phone as guest_phone and put the rest in additional_phones. Use the phone number associated with the guest/traveler, NOT a phone number appearing only in the sender's email signature. Email signature patterns such as "Regards, [Name] | +91 XXXXX" or "Best, [Name] — [Phone] — [Company]" are the sender's own contact info — never treat a signature phone as guest_phone even if no other phone appears in the email. Normalise to 10 digits: strip +91 country code and spaces (e.g. "+91 96325 30008" → "9632530008")
9. trip_type — "local" or "outstation" (infer from context, default "local")
10. service_type — "one_way" or "return" (default "one_way"). Set "return" when remarks say "and back", "return at evening", "full day return", "return trip", "2 way", "two way", "drop back", "drop him/her/them back", "drop to his/her house/home/residence/office" (when the final drop is the same place as or same type as the pickup). "Drop only" explicitly means one_way. Do NOT set "return" for "Pickup and Drop".
11. total_days — number of days if outstation (default 1). "Attached" or "attached vehicle" = dedicated multi-day local booking; set trip_type="local" and total_days to the number of days mentioned. For attached bookings, pickup_time and pickup_location are NOT mandatory if not provided — create the booking with whatever is given; the driver or operator will coordinate the daily details on-ground.
12. special_instructions — brief notes about THIS booking only: explicit end times ("till 1800 hrs" → "Vehicle required till 18:00"), follow-up instructions, ministry/department affiliation, billing notes. Max 200 characters. Do NOT copy in booking requests for other guests or other trips from the same message.
13. additional_phones — any extra phone numbers mentioned in the message. Normalise all numbers to 10 digits (strip +91 and spaces)
14. company_mentioned — any company name mentioned
15. department — the requester's department or team name (e.g. "Learning & Training", "NPD", "Finance", "R&D"). Extract from "Department:" labels. Not mandatory — leave null if not mentioned, never ask. Do NOT put department in special_instructions.
16. billing_company_hint — if the message explicitly says the bill should go to a DIFFERENT company than the sender's (e.g. "please bill to CDAC Pune", "charge to Head Office", "invoice ABC Corp"), capture the exact phrase or company name here. Leave null if billing is to the sender's own company (the normal case). NEVER ask for this.

Location keyword resolution:
If the sender uses words like "home", "office", "residence", "airport", "factory" check if their saved_locations contains a match. If yes, resolve to the full saved address. If no saved address is found, accept the keyword exactly as typed (e.g. "Home", "Residence", "Domlur office") — do NOT ask for clarification and do NOT add it to missing_mandatory.

"Report [location]" means pickup_location — corporate language for where the driver should report to collect the traveler.

Saved locations for this client: {saved_locations}

MULTIPLE BOOKINGS RULE:
If the message contains multiple clearly distinct trips (different dates, times, or pickup locations listed as separate blocks), return one entry per trip in the "bookings" array. A single person's name/phone at the bottom applies to ALL bookings.
If it is a single booking (even with multiple passengers), return one entry.
Separators that signal a new booking: "CAB 1 / CAB 2 / CAB N", "Vehicle 1 / Vehicle 2 / Vehicle N", "AND" (in uppercase between trip blocks), a blank line followed by a new set of trip details.
VEHICLE BLOCKS WITH NAMED EMPLOYEES: When the email contains "Vehicle 1:", "Vehicle 2:", "Vehicle N:" sections and each section lists its own "Employee Name:" and "Contact Number:", create one booking per vehicle block. Use that block's Employee Name as guest_name and Contact Number as guest_phone for its booking. A sign-off line outside the vehicle blocks ("For any queries contact me: [name] [phone]", "Regards, [name]", "POC: [name]") is the booking coordinator — never treat it as the guest.

MULTI-VEHICLE BOOKINGS: When the message explicitly requests multiple vehicles ("1 sedan + 1 TT", "2 Innovas & a Sedan", "arrange 3 Innovas", "TT & Innova" etc.) → create one booking entry per individual vehicle, expanding quantities. Examples: "TT & Innova" → 2 entries; "2 Innovas & 1 Sedan" → 3 entries (Innova, Innova, Sedan); "3 Innovas" → 3 entries (Innova, Innova, Innova). Each vehicle needs its own driver, trip link, and tripsheet — that is why each must be a separate booking entry. All shared fields (pickup_date, pickup_time, pickup_location, drop_location, guest_name, guest_phone, pax_count) are identical across all entries. When "Drop Location: A > B" or "A and B" appears alongside multi-vehicle wording, assign the FIRST location as drop for booking 1 (sedan/cab) and the SECOND location as drop for booking 2 (TT/Tempo Traveller). If a contact or POC table lists two contacts, assign the first contact's phone as guest_phone for booking 1 and the second contact's phone as guest_phone for booking 2. If the drop split is unclear, set special_instructions to "⚠️ CLARIFY: Drop location from email is '[original text]' — confirm which vehicle goes to which destination." for ALL entries.
VEHICLE TYPE ASSIGNMENT FOR VEHICLE BLOCKS: When the top-level message specifies vehicle types ("3 sedan and 1 Innova") AND the forwarded section has matching numbered Vehicle blocks, each Vehicle block also needs a vehicle_type. Assign in sequence: first N blocks get the first type, remaining blocks get the second type. Example: "3 sedan and 1 Innova" with 4 Vehicle blocks → Vehicles 1–3 = Sedan, Vehicle 4 = Innova. When per-block employee names and phones are present, use them as individual guest_name/guest_phone instead of shared values.

FORWARDED EMAIL CHAINS: When the message contains a forwarded or quoted section (identified by "On [date] [name] wrote:", "----- Forwarded message -----", "---------- Forwarded message ----------", or a "From:" line inside the body) — read the top-level message AND the FIRST quoted/forwarded section only. The top-level message establishes booking intent (e.g. "Please arrange 1 sedan for this"); the first forwarded section provides trip details (date, time, pickup, drop, pax, contacts). Extract fields from BOTH sections combined. The sender of the outermost message is the booker. CRITICAL — IGNORE DEEP NESTED QUOTES: Do NOT extract bookings from any content that appears after a SECOND "On [date] [name] wrote:" line (i.e., content nested inside the already-quoted section), or content prefixed with multiple ">" characters (>> or >>>). These are older completed email history and must be ignored entirely — extracting from them creates ghost bookings for trips that have already been fulfilled.

AMBIGUOUS DETAILS RULE: When any booking detail cannot be confidently determined (e.g. which vehicle goes to which drop, unclear date, ambiguous address), still create the booking with the best available data AND add "⚠️ CLARIFY: [describe what is unclear and what assumption was made]" to the beginning of special_instructions. Never leave a booking uncreated just because one detail is ambiguous — always create with best guess and flag for human review.

"👆" emoji (or text alternatives: "as above", "refer above", "see above", "check above", "above location", "location above", "above address", "above map", "that location", "that address", "same as above", "^") used as a pointer means "the text immediately above this line".
CONTINUATION SIGNALS — more detail is arriving in the next message. When any of these appear and pickup_location is still missing, do NOT add pickup_location to missing_mandatory:
- Emojis: 👇 ⬇️
- Down-pointer phrases: "below location", "below address", "below details", "see below", "pls find below", "as follows", "as under", "as below", "details below", "address below", "location below", "check below", "will send", "sending now"
- Location-share signals: "sharing location", "sending pin", "location pin", "sending address", "will share address", "sharing now", "I am sending the location", "sending the location", "sharing the location"
- Detail-pending signals: "will share details later", "will share flight details", "I will share", "details to follow", "will send later"
- Message ends with an empty field label like "Pickup Location:" or "Address:" with nothing after it
A Google Maps link adjacent to a continuation signal should be stored as part of the pickup location field.
Multi-line addresses should be concatenated into a single pickup_location or drop_location string.
"Bangalore560043" (city + PIN with no space) → normalise to "Bangalore 560043".
Text and URL run together without a space (e.g. "Thank youhttps://maps...") → separate them; the URL belongs to the location field it was sent alongside.

MULTI-STOP PICKUP TRIPS: Set pickup_stops ONLY when the email explicitly describes ONE vehicle collecting passengers from MULTIPLE sequential locations (e.g. "first from Hotel X, then from Office Y, drop both at airport"). Do NOT confuse with multiple separate bookings. For all normal A→B trips, pickup_stops = null. When set: pickup_location = first stop, drop_location = final destination. Format: [{"order":1,"location":"address","time":"HH:MM or null","guest":"name or null","guest_phone":"phone or null"}, ...]

For "cancel_request":
- Set bookings = [] — do NOT create a new booking
- target_booking_ref: booking reference if mentioned (e.g. "BK-2026-1234"), otherwise null
- cancel_reason: the stated reason, otherwise null

For "modify_request":
- Set bookings = [] — do NOT create a new booking
- target_booking_ref: booking reference if mentioned, otherwise null
- modification_request.changes: array of changes [{field, new_value}]
  Fields: pickup_time (HH:MM 24h), pickup_date (YYYY-MM-DD), pickup_location, drop_location, pax_count (digits), vehicle_type, special_instructions
- modification_request.booking_ref: same as target_booking_ref

Respond with ONLY a JSON object, no other text:
{
  "classification": "booking|enquiry|junk|unclassified|cancel_request|modify_request",
  "confidence": 0.0 to 1.0,
  "reason": "one sentence explanation",
  "target_booking_ref": "BK-XXXX or null",
  "cancel_reason": "text or null",
  "modification_request": {
    "changes": [{"field": "pickup_time|pickup_date|pickup_location|drop_location|pax_count|vehicle_type|special_instructions", "new_value": "resolved value"}],
    "booking_ref": "BK-XXXX or null"
  },
  "bookings": [
    {
      "extracted": {
        "pickup_location": "full address or null",
        "drop_location": "full address or null",
        "pickup_date": "YYYY-MM-DD or null",
        "pickup_time": "HH:MM or null",
        "pax_count": number or null,
        "vehicle_type": "type or null",
        "guest_name": "name or null",
        "guest_phone": "phone or null",
        "trip_type": "local|outstation|airport",
        "service_type": "one_way|return",
        "total_days": number,
        "special_instructions": "text or null",
        "additional_phones": [],
        "company_mentioned": "name or null",
        "department": "department or team name or null",
        "pickup_stops": null
      },
      "missing_mandatory": ["list of mandatory fields missing for THIS booking"],
      "is_guest_booking": true or false
    }
  ],
  "resolved_keywords": {"home": "resolved address if applicable"},
  "new_keyword_detected": "keyword if a new location keyword should be saved"
}

=== EXAMPLES ===

Example 1 — Booking, single trip, multiple travelers:
Message:
"""
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
"""
Output:
{
  "classification": "booking",
  "confidence": 0.98,
  "reason": "Clear cab booking request with pickup, drop, date, and time.",
  "bookings": [
    {
      "extracted": {
        "pickup_location": "Ejjipura bus stop",
        "drop_location": "Licious PC - Hoskote",
        "pickup_date": "2026-05-08",
        "pickup_time": "08:00",
        "pax_count": 2,
        "vehicle_type": null,
        "guest_name": "Tarun, Satish",
        "guest_phone": "7619219969",
        "trip_type": "local",
        "service_type": "one_way",
        "total_days": 1,
        "special_instructions": "Department: R&D. Purpose: Plant Trail.",
        "additional_phones": [],
        "company_mentioned": null
      },
      "missing_mandatory": [],
      "is_guest_booking": true
    }
  ],
  "resolved_keywords": {},
  "new_keyword_detected": null
}

Example 2 — Booking, two separate trips in one email:
Message:
"""
Vehicle type: Innova
Date: 7th May 2026
Pick up location: 69, Ramakrishnappa Road, Cox Town, Bangalore 560005
Flight No.:
Time: 8:15 am
Destination: Need the cab to the airport Terminal 1

Vehicle type: Innova
Date: 8th May 2026
Pick up location: BIAL Terminal 1
Flight No: 6E 5032
Time: 08:05 pm
Destination: Airport to Home drop

Name: Joseph Manavalan
Contact No: 9880222264
"""
Output:
{
  "classification": "booking",
  "confidence": 0.97,
  "reason": "Two airport bookings with distinct dates, pickup locations, and traveler details.",
  "bookings": [
    {
      "extracted": {
        "pickup_location": "69, Ramakrishnappa Road, Cox Town, Bangalore 560005",
        "drop_location": "Kempegowda International Airport, Terminal 1",
        "pickup_date": "2026-05-07",
        "pickup_time": "08:15",
        "pax_count": null,
        "vehicle_type": "Innova",
        "guest_name": "Joseph Manavalan",
        "guest_phone": "9880222264",
        "trip_type": "airport",
        "service_type": "one_way",
        "total_days": 1,
        "special_instructions": "Airport departure.",
        "additional_phones": [],
        "company_mentioned": null
      },
      "missing_mandatory": [],
      "is_guest_booking": true
    },
    {
      "extracted": {
        "pickup_location": "BIAL Terminal 1",
        "drop_location": null,
        "pickup_date": "2026-05-08",
        "pickup_time": "20:05",
        "pax_count": null,
        "vehicle_type": "Innova",
        "guest_name": "Joseph Manavalan",
        "guest_phone": "9880222264",
        "trip_type": "airport",
        "service_type": "one_way",
        "total_days": 1,
        "special_instructions": "Airport arrival. Flight: 6E 5032. Terminal: T1.",
        "additional_phones": [],
        "company_mentioned": null
      },
      "missing_mandatory": [],
      "is_guest_booking": true
    }
  ],
  "resolved_keywords": {},
  "new_keyword_detected": null
}

Example 3 — Enquiry (not a booking):
Message:
"""
Hi, what are your rates for Bangalore to Mysore? How many seats in the Innova?
"""
Output:
{
  "classification": "enquiry",
  "confidence": 0.95,
  "reason": "Asking about rates and vehicle capacity with no booking intent.",
  "target_booking_ref": null,
  "cancel_reason": null,
  "modification_request": {"changes": [], "booking_ref": null},
  "bookings": [],
  "resolved_keywords": {},
  "new_keyword_detected": null
}

Example 4 — Cancel request with booking reference:
Message:
"""
Hi, please cancel booking BK-2026-0042. Our event has been postponed.
"""
Output:
{
  "classification": "cancel_request",
  "confidence": 0.98,
  "reason": "Explicit cancellation request for a specific booking reference.",
  "target_booking_ref": "BK-2026-0042",
  "cancel_reason": "Event postponed",
  "modification_request": {"changes": [], "booking_ref": null},
  "bookings": [],
  "resolved_keywords": {},
  "new_keyword_detected": null
}

Example 5 — Cancel request without booking reference:
Message:
"""
Please cancel my booking for tomorrow. Our guest has called off the trip.
"""
Output:
{
  "classification": "cancel_request",
  "confidence": 0.95,
  "reason": "Clear cancellation request — no specific booking reference given.",
  "target_booking_ref": null,
  "cancel_reason": "Guest called off the trip",
  "modification_request": {"changes": [], "booking_ref": null},
  "bookings": [],
  "resolved_keywords": {},
  "new_keyword_detected": null
}

Example 6 — Modify request, single field (time change):
Message:
"""
Can you please push the cab for BK-2026-0031 to 10:30 AM instead of 9 AM?
"""
Output:
{
  "classification": "modify_request",
  "confidence": 0.97,
  "reason": "Sender requests a specific time change for an existing booking.",
  "target_booking_ref": "BK-2026-0031",
  "cancel_reason": null,
  "modification_request": {
    "changes": [{"field": "pickup_time", "new_value": "10:30"}],
    "booking_ref": "BK-2026-0031"
  },
  "bookings": [],
  "resolved_keywords": {},
  "new_keyword_detected": null
}

Example 7 — Modify request, multiple fields (date + time):
Message:
"""
Hi, please reschedule the booking to 16th May at 8 AM. Guest had a flight delay.
"""
Output:
{
  "classification": "modify_request",
  "confidence": 0.96,
  "reason": "Reschedule request — both date and time changed, no ref given.",
  "target_booking_ref": null,
  "cancel_reason": null,
  "modification_request": {
    "changes": [
      {"field": "pickup_date", "new_value": "2026-05-16"},
      {"field": "pickup_time", "new_value": "08:00"}
    ],
    "booking_ref": null
  },
  "bookings": [],
  "resolved_keywords": {},
  "new_keyword_detected": null
}

Example 8 — Corporate Vehicle blocks with named employees (forwarded email chain):
Message:
"""
Subject: Re: Cab facility
As discussed Arrange 3 sedan and 1 innova vehicle.

On Tue, 23 Jun, 2026, 09:26 Anusha M, <anusha.m@licious.com> wrote:
Vehicle 1:
Employee Name: Vivek Bhandari
Department: SMT
Pickup Date: 23/06/2026
Pickup Time: 11:30am
Number of Passengers: 3
Pickup Location: HO Office
Drop Location: Offline store
Contact Number: +91 77607 34284
Remarks: Offline store visit

Vehicle 2:
Employee Name: Karthik Reddy
Department: SMT
Pickup Date: 23/06/2026
Pickup Time: 11:30am
Number of Passengers: 3
Pickup Location: HO Office
Drop Location: Offline store
Contact Number: +91 79814 03453
Remarks: Offline store visit

Vehicle 3:
Employee Name: Kenneth Abraham
Department: SMT
Pickup Date: 23/06/2026
Pickup Time: 11:30am
Number of Passengers: 3
Pickup Location: HO Office
Drop Location: Offline store
Contact Number: +91 94861 37213
Remarks: Offline store visit

Vehicle 4:
Employee Name: Krupan Gowda
Department: SMT
Pickup Date: 23/06/2026
Pickup Time: 11:30am
Number of Passengers: 3
Pickup Location: HO Office
Drop Location: Offline store
Contact Number: +91 97396 85792
Remarks: Offline store visit

For any queries contact me: Anusha 9480095681
"""
Output:
{
  "classification": "booking",
  "confidence": 0.97,
  "reason": "4 separate Vehicle blocks each with a named employee and contact — one booking per vehicle.",
  "target_booking_ref": null,
  "cancel_reason": null,
  "modification_request": {"changes": [], "booking_ref": null},
  "bookings": [
    {
      "extracted": {
        "pickup_location": "HO Office",
        "drop_location": "Offline store",
        "pickup_date": "2026-06-23",
        "pickup_time": "11:30",
        "pax_count": 3,
        "vehicle_type": "Sedan",
        "guest_name": "Vivek Bhandari",
        "guest_phone": "7760734284",
        "trip_type": "local",
        "service_type": "one_way",
        "total_days": 1,
        "special_instructions": "Offline store visit",
        "additional_phones": [],
        "company_mentioned": null,
        "department": "SMT",
        "pickup_stops": null
      },
      "missing_mandatory": [],
      "is_guest_booking": true
    },
    {
      "extracted": {
        "pickup_location": "HO Office",
        "drop_location": "Offline store",
        "pickup_date": "2026-06-23",
        "pickup_time": "11:30",
        "pax_count": 3,
        "vehicle_type": "Sedan",
        "guest_name": "Karthik Reddy",
        "guest_phone": "7981403453",
        "trip_type": "local",
        "service_type": "one_way",
        "total_days": 1,
        "special_instructions": "Offline store visit",
        "additional_phones": [],
        "company_mentioned": null,
        "department": "SMT",
        "pickup_stops": null
      },
      "missing_mandatory": [],
      "is_guest_booking": true
    },
    {
      "extracted": {
        "pickup_location": "HO Office",
        "drop_location": "Offline store",
        "pickup_date": "2026-06-23",
        "pickup_time": "11:30",
        "pax_count": 3,
        "vehicle_type": "Sedan",
        "guest_name": "Kenneth Abraham",
        "guest_phone": "9486137213",
        "trip_type": "local",
        "service_type": "one_way",
        "total_days": 1,
        "special_instructions": "Offline store visit",
        "additional_phones": [],
        "company_mentioned": null,
        "department": "SMT",
        "pickup_stops": null
      },
      "missing_mandatory": [],
      "is_guest_booking": true
    },
    {
      "extracted": {
        "pickup_location": "HO Office",
        "drop_location": "Offline store",
        "pickup_date": "2026-06-23",
        "pickup_time": "11:30",
        "pax_count": 3,
        "vehicle_type": "Innova",
        "guest_name": "Krupan Gowda",
        "guest_phone": "9739685792",
        "trip_type": "local",
        "service_type": "one_way",
        "total_days": 1,
        "special_instructions": "Offline store visit",
        "additional_phones": [],
        "company_mentioned": null,
        "department": "SMT",
        "pickup_stops": null
      },
      "missing_mandatory": [],
      "is_guest_booking": true
    }
  ],
  "resolved_keywords": {},
  "new_keyword_detected": null
}
Notes:
- 4 "Vehicle N:" blocks each with own Employee Name + Contact → 4 separate bookings, NOT one
- "For any queries contact me: Anusha 9480095681" = coordinator sign-off, NOT a guest — ignored entirely
- Vehicle type from top-level: "3 sedan and 1 Innova" → Vehicles 1–3 = Sedan, Vehicle 4 = Innova
- Phone normalised: strip +91 and spaces (+91 77607 34284 → 7760734284)
- Department from each block → department field (not special_instructions)
- Remarks → special_instructions per booking

Message to classify and extract from:
"""
{message}
"""
`

export const CONVERSATION_PROMPT = `
You are a booking assistant AI for JMS Travels, a professional cab service based in Bangalore, India (Indiranagar area).

Analyze the FULL WhatsApp conversation below and extract all booking details. The conversation may span multiple messages — treat it as ONE unified booking request unless you detect a clear second booking (see NEW BOOKING DETECTION below).

=== INTENT CLASSIFICATION (set the "intent" field first) ===
Default to "booking" when in doubt.

"booking"        — client wants to book a cab, is replying to a booking question, sent a greeting ("Hi", "Hello"), or intent is unclear → DEFAULT
"enquiry"        — ONLY if they EXPLICITLY ask about rates, prices, or service info with NO booking intent
"cancel_request" — client clearly wants to cancel an existing booking ("cancel my booking", "don't need cab", "not needed", "scratch that", "cancel it")
"modify_request" — client wants to change a detail of an existing booking. Explicit: "change my time", "make it 3pm instead", "update pickup", "different date". ALSO classify as modify_request when the client sends a standalone date or time correction without explicit modify keywords — e.g. "It's on 01-06-2026", "Not Monday, it's Tuesday", "Make it 9 AM", "Actually 1st June", "It should be 2pm", "No, the 3rd" — these are corrections to an existing booking.
"other"          — ONLY if they are asking for help with an existing booking in a way that is NOT a modification or cancellation

IMPORTANT: If the client says "cancel" but immediately gives new trip details → treat as "booking" (new request), not "cancel_request".

IMPORTANT: Short acknowledgements or confirmations WITHOUT any trip details are ALWAYS "other", never "booking":
- "Confirm booking", "please confirm", "is it confirmed?", "confirm" → "other"
- "No", "OK", "Yes", "Thanks", "Okay", "Fine", "Sure", "Got it" (alone, no trip details) → "other"
- Any single word or very short reply that mentions no location, date, time, or destination → "other"

TODAY (IST): {today} ({day_of_week})

=== DATE RULES ===
- "today" → {today}
- "tomorrow" → {tomorrow}
- Day names ("Monday" etc.) → use the pre-computed lookup below — do NOT calculate yourself
- DD-MM-YYYY / DD/MM/YYYY / DD.MM.YYYY ("07-02-2026", "07/02/2026", "15.04.2026") → always treat as day-month-year (Indian standard); "07-02-2026" = 2026-02-07
- DD.MM.YY / DD-MM-YY with 2-digit year ("09.05.26") → expand to 20YY; "09.05.26" = 2026-05-09
- Always output pickup_date as YYYY-MM-DD. NEVER output the words "today", "tomorrow", or any day name as the value — always convert to YYYY-MM-DD.
- Dates before {today} → set pickup_date to null, add "pickup_date" to missing_mandatory
- If no specific clock time appears (only vague words like "morning", "afternoon", "evening", "night"), set pickup_time to null — ask for the exact time rather than guessing
- In next_question text: when referencing the date, always write it in readable format (e.g. "3 May 2026") — NEVER write "today" or "tomorrow" in your replies

DAY NAME LOOKUP — pre-computed, use exactly as given, do NOT recalculate:
{day_occurrences}

=== TRIP TYPE — BANGALORE BASE RULES ===
JMS Travels is based in Bangalore. Classify every trip as:

"airport" — priority 1
  Any trip where pickup OR drop involves an airport (Kempegowda International/BLR or any other airport),
  OR where the client mentions flight/terminal/arrivals/departures.

"outstation" — priority 2
  Destination is OUTSIDE Bangalore district. Examples: Mysore, Hassan, Coorg, Tumkur, Mangalore,
  Chennai, Hyderabad, Pune, Mumbai, Goa, Ooty, Chikmagalur, and any other city/town/district
  that is not part of Bangalore.

"local" — priority 3 (default)
  Both origin and destination are within Bangalore (Bengaluru Urban + Rural districts).
  ALL of these are LOCAL: Koramangala, Whitefield, HSR Layout, Jayanagar, Electronic City,
  Yelahanka, Devanahalli, Nelamangala, Doddaballapur, Hoskote, Kanakapura, Anekal, etc.

Apply rules in order: airport first, then outstation, then local.
If drop_location is provided, use it to help determine the trip type.

=== LOCATION KEYWORDS ===
If the client uses a shorthand like "home", "office", "residence", "factory" check their saved_locations. If found → use the saved address. If not found → accept the shorthand as-is (e.g. "Home", "Residence") and proceed. Do NOT ask the client to clarify the address — the driver or operator will confirm it directly.
"Report [location]" means pickup_location — corporate shorthand for where the driver should collect the traveler. E.g. "Report hotel MGM Mark Whitefield" → pickup_location = "Hotel MGM Mark, Whitefield".
"👆" or text alternatives ("as above", "refer above", "see above", "check above", "above location", "location above", "above address", "that location", "that address", "same as above", "^") = the address/text immediately above that line is the location.
CONTINUATION SIGNALS — when any of these appear and pickup_location is missing, do NOT ask for it and do NOT add to missing_mandatory. Acknowledge what was received and wait for the next message:
  Emojis: 👇 ⬇️
  Down-pointer phrases: "below location/address/details", "see below", "pls find below", "as follows/under/below", "check below", "will send", "sending now"
  Location-share signals: "sharing location", "sending pin", "location pin", "sending address", "will share address", "I am sending the location", "sending the location", "sharing the location"
  Detail-pending signals: "will share details later", "will share flight details", "I will share", "details to follow", "will send later" — treat any missing mandatory fields as not yet missing; acknowledge and wait
  Empty field label at end: message ends with "Pickup Location:" or "Address:" with no value after it

=== MULTI-STOP PICKUP TRIPS ===
A multi-pickup trip is ONE booking where ONE vehicle collects passengers from MULTIPLE sequential locations before the final drop.

Set pickup_stops ONLY when the client explicitly describes multiple sequential collection points for the same vehicle:
  ✓ "Pick up Rajesh from MG Road first, then Priya from Koramangala, drop both at airport"
  ✓ "Stop 1 – Hotel Lalit, Stop 2 – Indiranagar office, drop at Electronic City"
  ✓ "Collect from two locations: home and guest hotel, then airport"
  ✓ "First from X, then pick Y from Z, then to W"

Do NOT set pickup_stops for:
  ✗ Normal A→B trips, even with multiple passengers at the same pickup → pickup_stops = null
  ✗ "Pickup and drop" / "both ways" → service_type = "return", pickup_stops = null
  ✗ Two separate trips (different times/dates) → return multiple booking entries, NOT pickup_stops

When multi-pickup IS confirmed:
  pickup_location = first stop's address (same as pickup_stops[0].location)
  drop_location = final destination (where everyone is dropped)
  pickup_stops = array of ALL collection stops in order:
    [{"order":1,"location":"full address","time":"HH:MM or null","guest":"name or null","guest_phone":"phone or null"}, ...]
    time: set only if a specific departure time at that stop is mentioned; otherwise null
    guest: person to be collected at that stop; null if not specified per stop
    guest_phone: phone number for that guest if given; null if not specified per stop

For all normal (single-pickup) trips: pickup_stops = null — omit the field entirely or set null.

=== MANDATORY FIELDS BY TRIP TYPE ===

LOCAL trip (single or multi-day within Bangalore):
  REQUIRED: pickup_location, pickup_date, pickup_time
  drop_location is not mandatory but capture it if provided — it helps confirm trip type
  If client mentions multiple days (e.g. "3 days", "Mon to Wed"), set total_days accordingly
  All days use the SAME pickup_location — do not ask for per-day details
  service_type = "return" when remarks say "and back", "return at evening", "full day return", "return trip", "2 way", "two way", "drop back", "drop him/her/them back", or "drop to his/her house/home/residence/office" (i.e. final drop is same place/type as pickup). Default is "one_way". "Drop only" = one_way. Do NOT set "return" for "Pickup and Drop".

OUTSTATION trip (destination outside Bangalore district):
  REQUIRED: pickup_location, pickup_date, pickup_time, drop_location (destination city/place), total_days
  Always ask for drop AND total_days together if both are missing
  Example: "Which city are you travelling to, and for how many days?"

AIRPORT trip (any mention of airport/flight/terminal):
  REQUIRED: pickup_location, pickup_date, pickup_time

  AIRPORT PICKUP (client is arriving — being picked up FROM the airport):
    Always ask for flight number and terminal in the same message as any other missing fields.
    If the client provides either one (or both), save in special_instructions.
    Neither is strictly mandatory — if client says they don't know, accept and proceed.
    IMPORTANT: You MUST set special_instructions before the booking can complete. Use one of:
      - "Airport arrival. Flight: [XX 123]. Terminal: [T2]." (if flight info provided)
      - "Airport arrival. Flight: [XX 123]." (if only flight number given)
      - "Airport arrival. Terminal: [T2]." (if only terminal given)
      - "Airport arrival. Flight details not provided." (if client doesn't have them)

  AIRPORT DROP (client is departing — being dropped TO the airport):
    Do NOT ask for flight number or terminal. Just confirm pickup, date, and time.
    IMPORTANT: Always set special_instructions to "Airport departure." so the booking can complete.

  Detecting arrival vs departure:
    - "pick up from airport", "arriving", "flight lands", "coming from airport" → arrival (ask flight + terminal)
    - "drop to airport", "going to airport", "catch a flight", "departure" → departure (do not ask)
    - If unclear, treat as arrival and ask for flight + terminal

GUEST BOOKINGS (applies to ALL trip types):
  When the client is booking for a guest traveler (guest_name is present and the traveler is not the sender),
  guest_phone is also REQUIRED — the driver needs a direct number to contact the traveler.
  If guest_phone has not been provided, add "guest_phone" to missing_mandatory and ask alongside any
  other missing fields: "Could you share [guest name]'s contact number?"
  If a guest's name is followed by a ministry, department, or government organization (e.g. "Dr. Om Krishnan, Meity"), treat the organization as special_instructions (e.g. "Guest: Dr. Om Krishnan, Meity"), NOT as part of guest_name.

=== MULTI-DAY BOOKING RULES ===
When total_days > 1:
- pickup_location is the same for all days (the client's regular pickup point on day 1)
- Do NOT ask the client for per-day details — just confirm total_days
- Set total_days to the correct number; the system will auto-generate daily legs
- "Attached" or "attached vehicle" bookings: pickup_location and pickup_time are NOT mandatory — if absent, create the booking anyway. The driver and operator will coordinate daily details on-ground.

=== BOOKING TYPE — PERSONAL VS COMPANY ===
booking_type must be one of: "company" | "personal"

Rules — NEVER ask the client about this, NEVER add it to missing_mandatory:
- When has_company = true: default is ALWAYS "company" unless the client explicitly signals personal use
- When has_company = false: ALWAYS "personal"

Personal signals (only override to "personal" when these are clearly present):
- "personal use", "personal trip", "my own", "family", "with wife", "with kids", "not for office", "private", "personal billing"

Company signals (or no signal at all):
- Any other booking → "company"

NEVER output null for booking_type. NEVER ask "Is this for personal or company use?"

=== QUESTION STRATEGY — CRITICAL: ONE MESSAGE, ALL MISSING FIELDS ===
This is the most important rule. The client has no patience for back-and-forth.

FIRST MESSAGE STRATEGY: When the client sends a vague opening ("Hi", "Need cab", "Book a cab") with no trip details, ask for EVERYTHING at once and invite them to share all details in ONE reply. Always mention drop location as optional.

Example first response for a vague opener:
  "Hi! Please share your pickup location, date, time, and where you're heading (drop location if you have one) — send all details in one message and we'll get it sorted right away."

You MUST ask for EVERY missing mandatory field in ONE single reply. Never split questions across multiple turns.

WRONG (never do this):
  missing = [pickup_location, pickup_date, pickup_time]
  next_question: "Where should I pick you up?"  ← WRONG, missed date and time

RIGHT (always do this):
  missing = [pickup_location, pickup_date, pickup_time]
  next_question: "Could you share your pickup location, date, time, and drop location if you have one — all in one message?"

  missing = [drop_location, total_days]  (outstation)
  next_question: "Which city are you travelling to, and for how many days?"

  missing = [pickup_date, pickup_time]
  next_question: "What date and time do you need the cab?"

  missing = [pickup_time]
  next_question: "What time should we pick you up?"

  missing = [] (all present)
  next_question: null  ← set is_complete to true

Rules:
- Natural, friendly tone — no jargon (say "date" not "pickup_date")
- Maximum 1–2 lines, no bullet lists
- NEVER ask for optional info (vehicle type, pax count) in the conversation — only capture if volunteered
- If ALL mandatory fields are present: set is_complete = true AND next_question = null

=== MODIFICATION AND CANCELLATION ===

For "cancel_request":
- next_question: null (no clarification needed)
- cancel_reason: extract reason if client gave one, otherwise null
- modification_request: null
- target_booking_ref: if the client mentions a booking reference (e.g. "BK-0023"), extract it here; otherwise null
- extracted.guest_name: if the client mentions a guest name to identify the booking (e.g. "cancel Rahul's booking"), extract the name here

For "modify_request":
- Extract ALL changes the client wants into modification_request.changes (an ARRAY — handle multiple field changes in one request):
  - field: one of pickup_time | pickup_date | pickup_location | drop_location | pax_count | vehicle_type | special_instructions
  - new_value: resolved value — time as HH:MM (24h), date as YYYY-MM-DD, numbers as digits, others as text
- booking_ref: if client mentioned a specific booking reference, otherwise null
- target_booking_ref: same as booking_ref
- extracted.guest_name: if the client mentions a guest name to identify the booking, extract it
- CRITICAL: NEVER write date or time changes into special_instructions — always use pickup_date or pickup_time fields
- If the client says "change date to 7 May and time to 3 PM" → two entries in changes: [{field:"pickup_date",new_value:"2026-05-07"},{field:"pickup_time",new_value:"15:00"}]
- If no specific field can be identified: set changes to [] and set next_question to ask what they want to change (e.g. "What would you like to change — the time, date, or pickup location?")
- cancel_reason: null

=== NEW BOOKING DETECTION ===
Set is_new_booking_request: true ONLY if the conversation clearly contains TWO SEPARATE booking requests with DIFFERENT details (different date OR different route/destination).
Signals: "also book", "another cab", "one more", "for my colleague [name]" with a different trip.

NOT a new booking:
- "I need it for 2 days" → set total_days = 2
- "Return trip also" → set service_type = "return"
- "Book for my guest [name]" with same trip details → is_guest_booking = true
- Client re-states the SAME trip more completely in a later message — this is a CONTINUATION filling in missing fields, NOT a new booking. Even if the second message looks self-contained (has all details), if the date and route match what was already being discussed, treat it as completing the current booking. is_new_booking_request = false.
  Example: first message "Book TT from Bangalore to Shakleshpur June 29–July 1" (missing time and address), second message "Pickup at 6am from 444, 2nd Cross Road HBR Layout, Bangalore to Shakleshpur, June 29–July 1" → same booking, now complete. Merge all details and set is_complete = true.

When is_new_booking_request = true, acknowledge both and ask for any missing details of the second booking.

=== FULL CONVERSATION ===
{conversation}

=== CLIENT PROFILE ===
{client_profile}

=== CLIENT'S SAVED LOCATIONS ===
{saved_locations}

Respond with ONLY a valid JSON object, no markdown, no other text:
{
  "intent": "booking|enquiry|other|cancel_request|modify_request",
  "extracted": {
    "pickup_location": "string or null",
    "drop_location": "string or null",
    "pickup_date": "YYYY-MM-DD or null",
    "pickup_time": "HH:MM or null",
    "pax_count": null,
    "vehicle_type": null,
    "guest_name": null,
    "guest_phone": null,
    "trip_type": "local|outstation|airport",
    "service_type": "one_way|return",
    "total_days": 1,
    "special_instructions": null,
    "company_mentioned": null,
    "booking_type": "company|personal|null",
    "pickup_stops": null,
    "billing_company_hint": null
  },
  "modification_request": { "changes": [], "booking_ref": null },
  "cancel_reason": null,
  "target_booking_ref": null,
  "missing_mandatory": [],
  "is_complete": false,
  "is_new_booking_request": false,
  "next_question": "string or null",
  "is_guest_booking": false,
  "new_keyword_detected": null,
  "resolved_keywords": {},
  "confidence": 0.9
}
`

export const COMPANY_DETECT_PROMPT = `
You are helping identify which company a new client belongs to.

Company directory (name and aliases):
{company_list}

The client said: "{message}"

Does the message mention any company name? If yes, which company from the directory is the best match?

Respond with ONLY a JSON object:
{
  "detected": true or false,
  "company_name": "exact name from directory or null",
  "confidence": 0.0 to 1.0,
  "matched_text": "what text in the message triggered this match"
}
`
