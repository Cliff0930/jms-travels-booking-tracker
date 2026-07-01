import crypto from 'crypto'

const SECRET = process.env.OPERATOR_APP_SECRET ?? 'jms-operator-app-secret'

export function createOperatorAppToken(userId: string, email: string, name: string): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(JSON.stringify({
    sub: userId,
    email,
    name,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365,
  })).toString('base64url')
  const sig = crypto.createHmac('sha256', SECRET).update(`${header}.${payload}`).digest('base64url')
  return `${header}.${payload}.${sig}`
}

export function verifyOperatorAppToken(token: string): { userId: string; email: string; name: string } | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const [header, payload, sig] = parts
    const expectedSig = crypto.createHmac('sha256', SECRET)
      .update(`${header}.${payload}`)
      .digest('base64url')
    if (sig !== expectedSig) return null
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString()) as {
      sub: string; email: string; name: string; exp: number
    }
    if (data.exp < Math.floor(Date.now() / 1000)) return null
    return { userId: data.sub, email: data.email, name: data.name }
  } catch {
    return null
  }
}

export function extractOperatorToken(request: Request): { userId: string; email: string; name: string } | null {
  const auth = request.headers.get('authorization')
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) return null
  return verifyOperatorAppToken(token)
}
