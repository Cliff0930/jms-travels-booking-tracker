---
name: project-backup-issue
description: "Google Drive backup blocked by storage quota on all accounts — switching to email CSV backup is the agreed next step"
metadata: 
  node_type: memory
  type: project
  originSessionId: 0e9527b2-fe92-494c-8338-ed12a0ac7a1a
---

Daily backup to Google Sheets is broken — storage quota exceeded on every account tried.

**What was tried (2026-05-18):**
- Service account JWT → quota exceeded (service account's own Drive storage full)
- Switched to OAuth with separate Drive client (`GOOGLE_DRIVE_CLIENT_ID/SECRET/REFRESH_TOKEN`) for `jmstravelsprabhu@gmail.com` → quota exceeded (personal Drive full)
- Switched OAuth token to `bookings@jmstravels.net` (new folder created there) → quota exceeded (Workspace Drive also full/restricted)

**Current code state:**
- `src/app/api/cron/backup/route.ts` — already updated to use OAuth (`GOOGLE_DRIVE_CLIENT_ID`, `GOOGLE_DRIVE_CLIENT_SECRET`, `GOOGLE_DRIVE_REFRESH_TOKEN`) instead of service account JWT. Code is correct, just Drive quota blocks it.
- `scripts/get-drive-token.mjs` — helper script to generate Drive refresh token (uses localhost:3334, scope: drive.file + spreadsheets)
- Vercel has: `GOOGLE_DRIVE_CLIENT_ID`, `GOOGLE_DRIVE_CLIENT_SECRET`, `GOOGLE_DRIVE_REFRESH_TOKEN` set (token for `bookings@jmstravels.net`)
- `GOOGLE_DRIVE_BACKUP_FOLDER_ID` — updated to folder in `bookings@jmstravels.net` Drive

**⚠️ Gmail is completely untouched** — Drive uses its own separate OAuth client and env vars. Do NOT touch `GMAIL_CLIENT_ID/SECRET/REFRESH_TOKEN`.

**Agreed next step: Switch to email CSV backup**
- Instead of Google Sheets in Drive, email a CSV attachment to `bookings@jmstravels.net`
- No Drive quota needed — uses existing Gmail integration
- User agreed to this approach, just parked for later
- When resuming: rewrite `backup/route.ts` to use `sendEmail()` with CSV attachment instead of `drive.files.create()` + `sheets.spreadsheets`

**How to apply:** When user says "fix backup" or "email CSV backup", rewrite `src/app/api/cron/backup/route.ts` to email CSV instead of creating Sheets. Keep the Supabase data fetch and row-building logic — just change the output from Drive/Sheets to CSV email attachment via `src/lib/gmail/send.ts`.
