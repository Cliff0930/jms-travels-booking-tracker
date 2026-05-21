import crypto from 'crypto'

const SECRET = process.env.DRIVER_APP_SECRET ?? 'jms-driver-app-secret'

export function hashPin(phone: string, pin: string): string {
  return crypto.createHash('sha256')
    .update(`${phone}:${pin}:${SECRET}`)
    .digest('hex')
}

export function createDriverAppToken(driverId: string): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(JSON.stringify({
    sub: driverId,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365,
  })).toString('base64url')
  const sig = crypto.createHmac('sha256', SECRET).update(`${header}.${payload}`).digest('base64url')
  return `${header}.${payload}.${sig}`
}

export function verifyDriverAppToken(token: string): { driverId: string } | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const [header, payload, sig] = parts
    const expectedSig = crypto.createHmac('sha256', SECRET)
      .update(`${header}.${payload}`)
      .digest('base64url')
    if (sig !== expectedSig) return null
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString()) as { sub: string; exp: number }
    if (data.exp < Math.floor(Date.now() / 1000)) return null
    return { driverId: data.sub }
  } catch {
    return null
  }
}

export function extractDriverToken(request: Request): { driverId: string } | null {
  const auth = request.headers.get('authorization')
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) return null
  return verifyDriverAppToken(token)
}
