---
name: Deployment via GitHub auto-deploy
description: Never suggest manual Vercel CLI deploys — GitHub push triggers auto-deploy to booking.jmstravels.net
type: feedback
originSessionId: 342313d7-c8f6-42b5-aa30-066e2ed8a758
---
Always push to GitHub to deploy. The repo (Cliff0930/jms-travels-booking-tracker) is connected to Vercel and auto-deploys on every push to main. The live URL is https://booking.jmstravels.net.

**Why:** User corrected this repeatedly — Vercel CLI deploys are unnecessary and confusing.

**How to apply:** After every code change, commit and push to GitHub. That IS the deployment. Never suggest `vercel --prod` or `vercel link`.
