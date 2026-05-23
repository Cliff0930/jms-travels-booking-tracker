---
name: feedback-gemini-day-of-week
description: "Gemini gets day-of-week wrong when resolving weekday names to dates — always pass {day_of_week} explicitly in prompts"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 1ee64c17-2b4c-4ede-a7b9-4300c1ed1afb
---

Always inject `{day_of_week}` (e.g. "Saturday") alongside `{today}` in every Gemini prompt that resolves day names like "Monday" or "Tuesday" to dates.

**Why:** Gemini was computing day-of-week from the date string internally and getting it wrong by 1 day — "Monday" resolved to Tuesday. A WhatsApp booking saying "Monday 7 Am" got booked for 26-05-2026 (Tuesday) instead of 25-05-2026 (Monday). Fixed 2026-05-23.

**How to apply:**
- `classify-and-extract.ts` and `converse.ts` both have `getDayOfWeekIST()` helpers — use them and add `.replace(/{day_of_week}/g, dayOfWeek)` to the prompt builder.
- Prompt wording: `TODAY'S DATE (IST): {today} ({day_of_week})` and `counting forward from {today} ({day_of_week})` in the weekday rule.
- If adding a new Gemini prompt that handles dates, follow the same pattern — never rely on Gemini deriving the day name from the date.
