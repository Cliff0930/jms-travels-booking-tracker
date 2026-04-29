import { createHmac } from 'crypto'

function secret() {
  return process.env.DRIVER_STATUS_SECRET || 'dev-secret'
}

export function generateDriverToken(bookingId: string, status: 'arrived' | 'completed'): string {
  return createHmac('sha256', secret()).update(`${bookingId}:${status}`).digest('hex')
}

export function verifyDriverToken(bookingId: string, status: string, token: string): boolean {
  if (status !== 'arrived' && status !== 'completed') return false
  const expected = generateDriverToken(bookingId, status)
  return token === expected
}

export function driverStatusLink(appUrl: string, bookingId: string, status: 'arrived' | 'completed'): string {
  const token = generateDriverToken(bookingId, status)
  return `${appUrl}/driver-status?booking=${bookingId}&status=${status}&token=${token}`
}
