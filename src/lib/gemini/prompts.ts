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

TODAY'S DATE (IST): {today}

DATE RESOLUTION RULES — always output pickup_date as YYYY-MM-DD, never as words:
- "today" → {today}
- "tomorrow" → the day after {today}
- "day after tomorrow" → 2 days after {today}
- Day of week ("Monday", "Tuesday", etc.) → the NEXT upcoming date that falls on that day (if today is that day, use next week's occurrence)
- Partial dates ("1st May", "May 1", "1/5", "01-05") → resolve to the correct YYYY-MM-DD using the current or next year as appropriate
- Full dates ("1st May 2026", "2026-05-01") → use exactly as given
- NEVER output the word "today", "tomorrow", or a weekday name as the pickup_date value — always convert to YYYY-MM-DD

IMPORTANT: pickup_date must NEVER be before {today}. If the extracted date is in the past, set pickup_date to null and add "pickup_date" to missing_mandatory.

Known client profile (may be empty for new clients):
{client_profile}

Fields to extract:
1. pickup_location — where to pick up (MANDATORY — ask if missing)
2. drop_location — drop off location (OPTIONAL — leave null if not mentioned, never ask)
3. pickup_date — date of travel in YYYY-MM-DD format (MANDATORY — ask if missing or past)
4. pickup_time — time of travel in HH:MM 24h format (MANDATORY — ask if missing)
5. pax_count — number of passengers (OPTIONAL for known clients — use profile default if not mentioned)
6. vehicle_type — type of vehicle needed (OPTIONAL for known clients — use profile default if not mentioned)
7. guest_name — if booking is for someone other than the sender
8. guest_phone — guest phone number if mentioned
9. trip_type — "local" or "outstation" (infer from context, default "local")
10. service_type — "one_way" or "return" (default "one_way")
11. total_days — number of days if outstation (default 1)
12. special_instructions — any special notes
13. additional_phones — any extra phone numbers mentioned in the message
14. company_mentioned — any company name mentioned

Location keyword resolution:
If the sender uses words like "home", "office", "airport", "factory" check if their saved_locations contains a match. If yes, resolve to the saved address. If no saved address exists for that keyword, treat it as missing and ask.

Saved locations for this client: {saved_locations}

Respond with ONLY a JSON object, no other text:
{
  "extracted": {
    "pickup_location": "full address or resolved nickname or null",
    "drop_location": "full address or null",
    "pickup_date": "YYYY-MM-DD or null",
    "pickup_time": "HH:MM or null",
    "pax_count": number or null,
    "vehicle_type": "type or null",
    "guest_name": "name or null",
    "guest_phone": "phone or null",
    "trip_type": "local|outstation",
    "service_type": "one_way|return",
    "total_days": number,
    "special_instructions": "text or null",
    "additional_phones": [],
    "company_mentioned": "name or null"
  },
  "missing_mandatory": ["list of mandatory fields that are missing"],
  "resolved_keywords": {"home": "resolved address if applicable"},
  "new_keyword_detected": "keyword if a new location keyword should be saved",
  "is_guest_booking": true or false,
  "confidence": 0.0 to 1.0
}

Message to extract from:
"""
{message}
"""
`

export const CONVERSATION_PROMPT = `
You are a booking assistant AI for JMS Travels, a professional cab service in India.

Analyze a FULL WhatsApp conversation between a client and JMS Travels to extract booking details.
The conversation may span multiple messages — treat it as ONE booking request.

TODAY (IST): {today}

=== DATE RULES ===
- "today" → {today}
- "tomorrow" → day after {today}
- Day names ("Monday" etc.) → next upcoming occurrence
- Always output pickup_date as YYYY-MM-DD. NEVER use words like "today" or "tomorrow" as the value.
- Dates before {today} → set pickup_date to null, add "pickup_date" to missing_mandatory

=== TRIP TYPE ===
Classify as one of:
- "airport" — pickup or drop involves an airport, OR flight/terminal/arrivals/departures mentioned
- "outstation" — travel to another city, overnight stay, multi-day, or destination is clearly outside the city
- "local" — within the same city, no airport or outstation context

=== FOR AIRPORT TRIPS ===
Also extract from the conversation and include in special_instructions (formatted clearly):
- Flight or train number (if mentioned)
- Terminal number or name
- Whether it is ARRIVAL (picking client FROM airport) or DEPARTURE (dropping TO airport)
- Format: "Airport [arrival|departure]. Flight: [number]. Terminal: [terminal]."

=== FOR OUTSTATION / MULTI-DAY TRIPS ===
If total_days > 1 or multiple dates are mentioned, populate day_legs:
[{ "day": 1, "date": "YYYY-MM-DD", "pickup_time": "HH:MM or null", "pickup_location": "...", "drop_location": "..." }]

=== MANDATORY FIELDS (ALL must be present to create a booking) ===
1. pickup_location
2. pickup_date
3. pickup_time

=== OPTIONAL FIELDS ===
- drop_location — for outstation/airport; optional for local
- pax_count — use client profile default if not mentioned
- vehicle_type — use client profile default if not mentioned
- special_instructions — flight info, special requests, etc.

=== QUESTION STRATEGY ===
When the booking is incomplete, suggest exactly ONE natural question to ask next.
Priority order: pickup_location → pickup_date → pickup_time → (airport: flight info)
Rules:
- One question only. 1–2 sentences max. No bullet points. No field name jargon.
- If pickup_location is missing: "Where would you like to be picked up from?"
- If pickup_date is missing: "What date do you need the cab?"
- If pickup_time is missing: "What time should we pick you up?"
- If airport trip and no flight info yet: "Could you share your flight number and terminal? This helps us track any delays."
- If all mandatory fields are present: set next_question to null

=== FULL CONVERSATION ===
{conversation}

=== CLIENT PROFILE ===
{client_profile}

=== CLIENT'S SAVED LOCATIONS ===
{saved_locations}

Respond with ONLY a valid JSON object, no other text:
{
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
    "day_legs": []
  },
  "missing_mandatory": [],
  "is_complete": false,
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
