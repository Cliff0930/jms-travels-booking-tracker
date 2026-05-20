/**
 * One-time script to generate a Google OAuth refresh token with
 * both Gmail AND Drive scopes.
 *
 * Usage:
 *   node scripts/generate-google-token.mjs
 *
 * Then:
 *   1. Open the printed URL in your browser
 *   2. Sign in as bookings@jmstravels.net and approve all permissions
 *   3. You'll be redirected to localhost (page won't load — that's fine)
 *   4. Copy the FULL URL from your browser address bar and paste it here
 *   5. The script prints your new GMAIL_REFRESH_TOKEN — update it in Vercel
 */

import { createServer } from 'http'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { URL } from 'url'
import path from 'path'
import { google } from 'googleapis'

// Read .env.local
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const envPath = path.resolve(__dirname, '../.env.local')
const env = {}
for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
  const [key, ...rest] = line.split('=')
  if (key && rest.length) env[key.trim()] = rest.join('=').trim()
}

const CLIENT_ID     = env['GMAIL_CLIENT_ID']
const CLIENT_SECRET = env['GMAIL_CLIENT_SECRET']
const REDIRECT_URI  = 'http://localhost:8080/callback'

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('❌ GMAIL_CLIENT_ID or GMAIL_CLIENT_SECRET not found in .env.local')
  process.exit(1)
}

const oauth2 = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI)

const authUrl = oauth2.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent',
  scope: [
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/drive',
    'https://www.googleapis.com/auth/spreadsheets',
  ],
})

console.log('\n──────────────────────────────────────────────────────────')
console.log('Open this URL in your browser (sign in as bookings@jmstravels.net):')
console.log('\n' + authUrl + '\n')
console.log('──────────────────────────────────────────────────────────')
console.log('Waiting for Google to redirect to localhost:8080...\n')

// Spin up a temporary server to catch the redirect automatically
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost:8080')
  const code = url.searchParams.get('code')
  const error = url.searchParams.get('error')

  if (error) {
    res.end(`<h2>Error: ${error}</h2>`)
    console.error('❌ OAuth error:', error)
    server.close()
    return
  }

  if (!code) {
    res.end('<h2>No code found</h2>')
    return
  }

  try {
    const { tokens } = await oauth2.getToken(code)
    res.end('<h2>✅ Done! Check your terminal for the refresh token.</h2><p>You can close this tab.</p>')

    console.log('\n✅ Success! Here is your new refresh token:\n')
    console.log('GMAIL_REFRESH_TOKEN=' + tokens.refresh_token)
    console.log('\n──────────────────────────────────────────────────────────')
    console.log('Next steps:')
    console.log('1. Go to Vercel → Settings → Environment Variables')
    console.log('2. Update GMAIL_REFRESH_TOKEN with the value above')
    console.log('3. Redeploy (or push an empty commit)')
    console.log('4. Run the archive backup URL again')
    console.log('──────────────────────────────────────────────────────────\n')
  } catch (err) {
    res.end('<h2>Error exchanging token</h2><pre>' + err + '</pre>')
    console.error('❌ Token exchange failed:', err)
  }

  server.close()
}).listen(8080)

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error('❌ Port 8080 is in use. Close whatever is using it and retry.')
  } else {
    console.error('❌ Server error:', err)
  }
  process.exit(1)
})
