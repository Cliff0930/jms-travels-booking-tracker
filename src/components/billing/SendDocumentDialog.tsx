'use client'
import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Mail, MessageCircle, Download, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  open: boolean
  onClose: () => void
  pdfUrl: string
  docNumber: string
  defaultEmail: string
  defaultPhone: string
  defaultSubject: string
  defaultEmailBody: string
  defaultWaMessage: string
}

function normalizePhone(p: string): string {
  const digits = p.replace(/\D/g, '')
  if (digits.length === 10) return '91' + digits
  if (digits.startsWith('0') && digits.length === 11) return '91' + digits.slice(1)
  return digits
}

export function SendDocumentDialog({
  open, onClose, pdfUrl, docNumber,
  defaultEmail, defaultPhone, defaultSubject, defaultEmailBody, defaultWaMessage,
}: Props) {
  const [tab, setTab] = useState<'email' | 'whatsapp'>('email')
  const [toEmail, setToEmail] = useState(defaultEmail)
  const [ccEmail, setCcEmail] = useState('')
  const [subject, setSubject] = useState(defaultSubject)
  const [emailBody, setEmailBody] = useState(defaultEmailBody)
  const [phone, setPhone] = useState(defaultPhone)
  const [waMessage, setWaMessage] = useState(defaultWaMessage)

  function openGmailCompose() {
    const params = new URLSearchParams()
    if (toEmail.trim()) params.set('to', toEmail.trim())
    if (ccEmail.trim()) params.set('cc', ccEmail.trim())
    params.set('su', subject)
    params.set('body', emailBody)
    window.open(`https://mail.google.com/mail/?view=cm&${params.toString()}`, '_blank')
  }

  function openWhatsApp() {
    const normalized = normalizePhone(phone)
    if (!normalized) return
    const url = `https://web.whatsapp.com/send?phone=${normalized}&text=${encodeURIComponent(waMessage)}`
    window.open(url, '_blank')
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-2xl gap-4">
        <DialogHeader>
          <DialogTitle className="text-base">Send {docNumber}</DialogTitle>
        </DialogHeader>

        {/* Tab switcher */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
          {(['email', 'whatsapp'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                'flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md text-sm font-medium transition-colors',
                tab === t ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700',
              )}
            >
              {t === 'email' ? <Mail className="w-4 h-4" /> : <MessageCircle className="w-4 h-4" />}
              {t === 'email' ? 'Email' : 'WhatsApp'}
            </button>
          ))}
        </div>

        {tab === 'email' && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-gray-500">To *</Label>
                <Input
                  value={toEmail}
                  onChange={e => setToEmail(e.target.value)}
                  placeholder="client@email.com"
                  className="text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-gray-500">CC (optional)</Label>
                <Input
                  value={ccEmail}
                  onChange={e => setCcEmail(e.target.value)}
                  placeholder="cc@email.com"
                  className="text-sm"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-gray-500">Subject</Label>
              <Input
                value={subject}
                onChange={e => setSubject(e.target.value)}
                className="text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-gray-500">Message Body (editable)</Label>
              <textarea
                value={emailBody}
                onChange={e => setEmailBody(e.target.value)}
                rows={10}
                className="w-full text-sm border border-gray-200 rounded-md px-3 py-2 resize-y focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono leading-relaxed"
              />
            </div>
            <div className="rounded-lg bg-blue-50 border border-blue-100 px-3 py-2.5 text-xs text-blue-700 leading-relaxed">
              <strong>How to send:</strong> (1) Click <em>Download PDF</em> to save the invoice to your device. (2) Click <em>Open Gmail</em> — the message opens pre-filled. (3) Attach the PDF and hit Send from whichever Gmail account is active in your browser.
            </div>
            <div className="flex gap-2 pt-0.5">
              <Button
                variant="outline"
                className="gap-1.5"
                onClick={() => window.open(pdfUrl, '_blank')}
              >
                <Download className="w-4 h-4" /> Download PDF
              </Button>
              <Button
                className="gap-1.5 bg-[#1A56DB] hover:bg-[#1A56DB]/90 text-white"
                onClick={openGmailCompose}
              >
                <ExternalLink className="w-4 h-4" /> Open Gmail Compose
              </Button>
            </div>
          </div>
        )}

        {tab === 'whatsapp' && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-gray-500">Phone Number</Label>
              <Input
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="9845572207 or 919845572207"
                className="text-sm font-mono"
              />
              <p className="text-xs text-gray-400">10-digit Indian numbers get 91 prefix automatically. Include country code for others.</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-gray-500">Message (editable)</Label>
              <textarea
                value={waMessage}
                onChange={e => setWaMessage(e.target.value)}
                rows={9}
                className="w-full text-sm border border-gray-200 rounded-md px-3 py-2 resize-y focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent leading-relaxed"
              />
            </div>
            <div className="rounded-lg bg-green-50 border border-green-100 px-3 py-2.5 text-xs text-green-700 leading-relaxed">
              <strong>How to send:</strong> (1) Click <em>Download PDF</em> to save the invoice to your device. (2) Click <em>Open WhatsApp Web</em> — the message opens pre-filled in the chat. (3) Use the 📎 attachment icon in WhatsApp to attach the PDF, then send.
            </div>
            <div className="flex gap-2 pt-0.5">
              <Button
                variant="outline"
                className="gap-1.5"
                onClick={() => window.open(pdfUrl, '_blank')}
              >
                <Download className="w-4 h-4" /> Download PDF
              </Button>
              <Button
                className="gap-1.5 bg-green-600 hover:bg-green-700 text-white"
                onClick={openWhatsApp}
                disabled={!normalizePhone(phone)}
              >
                <ExternalLink className="w-4 h-4" /> Open WhatsApp Web
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
