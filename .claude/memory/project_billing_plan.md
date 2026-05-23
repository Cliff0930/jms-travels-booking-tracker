---
name: billing-software-plan
description: "Planned billing module for JMS Travels — decision to build inside CabFlow, feature list, DB tables, cost estimate"
metadata: 
  node_type: memory
  type: project
  originSessionId: 0e9527b2-fe92-494c-8338-ed12a0ac7a1a
---

Build billing inside CabFlow (same app), not as a separate application.

**Why:** All the data needed (bookings, trip sheets, KM, toll, parking, clients, companies) is already in the CabFlow DB. Building separate would require data sync and double the infrastructure for no real benefit at JMS's scale.

**How to apply:** When user says "start billing" or asks about invoicing, pick up from this plan. No new servers or DB needed — extend existing Vercel + Supabase setup.

---

## Feature plan (parked — user will specify when to start)

1. **Rate cards** — price per KM / per day / fixed per trip type, per company
2. **Invoice generator** — pulls from completed `trip_sheets` (KM, toll, parking) + applies rate card → GST PDF invoice
3. **Monthly billing run** — all completed bookings in a date range → one invoice per company
4. **Payment tracking** — invoice status: Draft → Sent → Paid / Partially Paid / Overdue
5. **Email invoice** — send PDF to company via existing Gmail integration

## DB tables to create
```sql
rate_cards         -- company_id, trip_type, price_per_km, fixed_rate, min_km
invoices           -- company_id, period, total_amount, gst_amount, status, pdf_url
invoice_line_items -- invoice_id, booking_id, trip_sheet_id, amount, description
payments           -- invoice_id, amount, paid_on, reference
```
All new tables need `GRANT ALL ON ... TO authenticated, anon, service_role` — see [[feedback_supabase_grants]].

## PDF library
Use `@react-pdf/renderer` — free, works client-side or server-side on Vercel. No extra cost.

## Cost
- No new infrastructure needed
- Vercel Hobby (free) handles it unless PDF generation is very heavy (then Vercel Pro = $20/mo)
- Supabase free tier fits for 1–2 years at current booking volume
- GST filing integration (ClearTax/Tally) — optional, much later, ~₹3,000–10,000/year
