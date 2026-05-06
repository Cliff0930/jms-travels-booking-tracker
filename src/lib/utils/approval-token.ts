import { createHmac } from 'crypto'

function secret() {
  return process.env.DRIVER_STATUS_SECRET || 'dev-secret'
}

export function generateApprovalToken(bookingId: string, action: 'approve' | 'reject'): string {
  return createHmac('sha256', secret()).update(`approval:${bookingId}:${action}`).digest('hex')
}

export function verifyApprovalToken(bookingId: string, action: string, token: string): boolean {
  if (action !== 'approve' && action !== 'reject') return false
  const expected = generateApprovalToken(bookingId, action)
  return token === expected
}

export function approvalLink(appUrl: string, bookingId: string, action: 'approve' | 'reject'): string {
  const token = generateApprovalToken(bookingId, action)
  return `${appUrl}/api/approve?booking=${bookingId}&action=${action}&token=${token}`
}
