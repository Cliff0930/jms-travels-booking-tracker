import { sendEmail } from '@/lib/gmail/send'
import { sendWhatsAppMessage } from '@/lib/whatsapp/send'

export function isAfterHours(): boolean {
  const istOffset = 5.5 * 60 * 60 * 1000
  const ist = new Date(Date.now() + istOffset)
  const totalMinutes = ist.getUTCHours() * 60 + ist.getUTCMinutes()
  // After 9:30 PM (21:30) or before 8:00 AM (08:00)
  return totalMinutes >= 21 * 60 + 30 || totalMinutes < 8 * 60
}

function buildWhatsAppBody(bookingRef: string): string {
  return [
    `⚠️ After-Hours Notice`,
    ``,
    `Your booking (${bookingRef}) was received after our office hours (9:30 PM IST).`,
    ``,
    `For immediate assistance, please call us at:`,
    `📞 9845572207`,
    ``,
    `If not urgent, your booking will be confirmed from 8:00 AM tomorrow.`,
    ``,
    `— JMS Travels`,
  ].join('\n')
}

function buildEmailBody(clientName: string, bookingRef: string): string {
  return [
    `Hi ${clientName},`,
    ``,
    `Your booking (Ref: ${bookingRef}) was received after our office hours (9:30 PM IST).`,
    ``,
    `For immediate action on your booking, please call us at 9845572207.`,
    ``,
    `If this is not urgent, your booking will be confirmed from 8:00 AM tomorrow.`,
    ``,
    `Thank you for your patience.`,
  ].join('\n')
}

export async function sendAfterHoursNotices({
  bookingRef,
  clientName,
  phone,
  email,
  emailCc,
  replyToThreadId,
  inReplyToMessageId,
}: {
  bookingRef: string
  clientName: string
  phone?: string | null
  email?: string | null
  emailCc?: string[]
  replyToThreadId?: string
  inReplyToMessageId?: string
}): Promise<void> {
  const tasks: Promise<unknown>[] = []

  if (phone) {
    tasks.push(
      sendWhatsAppMessage({
        to: phone,
        body: buildWhatsAppBody(bookingRef),
        log: {},
      }).catch(() => {})
    )
  }

  if (email) {
    tasks.push(
      sendEmail({
        to: email,
        subject: `After-Hours Notice – Your JMS Travels Booking ${bookingRef}`,
        body: buildEmailBody(clientName, bookingRef),
        cc: emailCc,
        replyToThreadId,
        inReplyToMessageId,
      }).catch(() => {})
    )
  }

  if (tasks.length > 0) await Promise.all(tasks)
}
