'use client'
import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Phone } from 'lucide-react'

interface ApproveByCallModalProps {
  bookingRef: string
  open: boolean
  onClose: () => void
  onConfirm: (note: string) => Promise<void>
  loading?: boolean
}

export function ApproveByCallModal({ bookingRef, open, onClose, onConfirm, loading }: ApproveByCallModalProps) {
  const [note, setNote] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!note.trim()) return
    await onConfirm(note)
    setNote('')
  }

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Phone className="w-5 h-5 text-[#1A56DB]" />
            Approve by Call
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Booking {bookingRef}</Label>
            <Textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="e.g. Approved verbally by Rahul at 3:15pm"
              rows={3}
              required
              className="border-[#C3C5D7]"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
            <Button type="submit" className="bg-[#1A56DB] hover:bg-[#003FB1] rounded-sm" disabled={loading || !note.trim()}>
              {loading ? 'Saving…' : 'Record Approval'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
