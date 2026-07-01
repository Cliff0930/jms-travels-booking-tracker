import { NextResponse } from 'next/server'
import { extractOperatorToken } from '@/lib/utils/operator-app-auth'

export async function GET(request: Request) {
  const operator = extractOperatorToken(request)
  if (!operator) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json({ id: operator.userId, email: operator.email, name: operator.name })
}
