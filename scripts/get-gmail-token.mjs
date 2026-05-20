// Usage: node scripts/get-gmail-token.mjs <CLIENT_ID> <CLIENT_SECRET>
import http from 'http'
import { exec } from 'child_process'

const CLIENT_ID     = process.argv[2]
const CLIENT_SECRET = process.argv[3]

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Usage: node scripts/get-gmail-token.mjs <CLIENT_ID> <CLIENT_SECRET>')
  process.exit(1)
}

const REDIRECT_URI = 'http://localhost:3333'
const SCOPE = 'https://www.googleapis.com/auth/gmail.readonly'

const authUrl =
  `https://accounts.google.com/o/oauth2/v2/auth` +
  `?client_id=${CLIENT_ID.trim()}` +
  `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
  `&response_type=code` +
  `&scope=${encodeURIComponent(SCOPE)}` +
  `&access_type=offline` +
  `&prompt=consent`

console.log('\n✅ Opening browser — sign in as bookings@jmstravels.net\n')
exec(`open "${authUrl}"`)

const code = await new Promise((resolve) => {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost:3333')
    const code = url.searchParams.get('code')
    res.end('<h2>✅ Got it! You can close this tab.</h2>')
    server.close()
    resolve(code)
  })
  server.listen(3333)
  console.log('Waiting for Google to redirect back...\n')
})

const resp = await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    code,
    client_id: CLIENT_ID.trim(),
    client_secret: CLIENT_SECRET.trim(),
    redirect_uri: REDIRECT_URI,
    grant_type: 'authorization_code',
  }),
})

const tokens = await resp.json()

if (tokens.refresh_token) {
  console.log('\n🎉 SUCCESS!\n')
  console.log('══════════════════════════════════════════════')
  console.log('GMAIL_REFRESH_TOKEN =', tokens.refresh_token)
  console.log('══════════════════════════════════════════════')
  console.log('\nPaste this into Vercel → GMAIL_REFRESH_TOKEN → Save → Redeploy')
} else {
  console.error('\n❌ Failed:', JSON.stringify(tokens, null, 2))
}
