---
name: Vercel deployment rules
description: Critical rules for deploying CabFlow to Vercel — cron limits, deploy method, API fallback
type: feedback
originSessionId: 3b2dc7af-22bd-4779-8fdc-b7a9537fdf3f
---
## Hobby plan cron limit — never use sub-daily crons

**Rule:** Never add a cron to `vercel.json` that runs more than once per day on the Hobby plan.

**Why:** Vercel Hobby plan only allows daily cron jobs. A `* * * * *` (every-minute) cron in `vercel.json` silently blocks ALL new deployments with error `cron_jobs_limits_reached` — it causes every push and deploy hook to fail without showing any error in the dashboard.

**How to apply:** Keep only `"0 1 * * *"` (daily backup) in `vercel.json`. Never add per-minute or per-hour crons without upgrading to Pro.

---

## GitHub auto-deploy via Vercel

**Rule:** Push to `main` on `Cliff0930/jms-travels-booking-tracker` → auto-deploys to `booking.jmstravels.net`.

**Why:** Vercel project `jmstravelprabhu-1531` is connected to GitHub account `Cliff0930` (Sign-in Methods shows this). Auto-deploy was broken for 13 hours on 2026-05-01 due to the cron limit issue above.

**How to apply:** After fixing cron issue, auto-deploy should work on push. If it breaks again, use the Vercel API fallback below.

---

## Vercel API manual deploy (fallback)

If auto-deploy breaks, create a Vercel API token (full account access) and run:
```bash
curl -X POST "https://api.vercel.com/v13/deployments?teamId=team_072mzg5tYyji5C8yBs3k5I7l&forceNew=1" \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"name":"jms-travels-booking-tracker","gitSource":{"type":"github","repoId":1224544727,"ref":"main"},"target":"production","project":"prj_SKLAP3Anio26Ajis7MqDyUe1r0sY"}'
```

Key IDs:
- GitHub repo ID: `1224544727`
- Vercel project ID: `prj_SKLAP3Anio26Ajis7MqDyUe1r0sY`
- Vercel team ID: `team_072mzg5tYyji5C8yBs3k5I7l`

Revoke the token immediately after use.
