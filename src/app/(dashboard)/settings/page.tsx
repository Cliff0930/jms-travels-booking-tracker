'use client'
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Send } from 'lucide-react'
import { toast } from 'sonner'
import type { MessageTemplate } from '@/types'

export default function SettingsPage() {
  const qc = useQueryClient()
  const [editingTemplate, setEditingTemplate] = useState<MessageTemplate | null>(null)
  const [testPhone, setTestPhone] = useState('')
  const [testEmail, setTestEmail] = useState('')
  const [testSending, setTestSending] = useState(false)

  const { data: templates = [] } = useQuery<MessageTemplate[]>({
    queryKey: ['templates'],
    queryFn: () => fetch('/api/settings/templates').then(r => r.json()),
  })

  async function handleSaveTemplate(e: React.FormEvent) {
    e.preventDefault()
    if (!editingTemplate) return
    try {
      await fetch(`/api/settings/templates/${editingTemplate.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: editingTemplate.body, subject: editingTemplate.subject }),
      })
      qc.invalidateQueries({ queryKey: ['templates'] })
      toast.success('Template saved')
    } catch {
      toast.error('Failed to save template')
    }
  }

  async function handleTestSend() {
    if (!editingTemplate) return
    const recipient_phone = testPhone.trim() || undefined
    const recipient_email = testEmail.trim() || undefined
    if (!recipient_phone && !recipient_email) {
      toast.error('Enter a phone number or email address to test send')
      return
    }
    setTestSending(true)
    try {
      const res = await fetch(`/api/settings/templates/${editingTemplate.id}/test-send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipient_phone, recipient_email }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success(`Test sent via ${data.channel} to ${data.recipient}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Test send failed')
    } finally {
      setTestSending(false)
    }
  }

  return (
    <div className="max-w-3xl">
      <PageHeader title="Settings" />
      <Tabs defaultValue="templates">
        <TabsList className="bg-[#EDEDF8] mb-5">
          <TabsTrigger value="templates" className="data-[state=active]:bg-white">Message Templates</TabsTrigger>
        </TabsList>

        <TabsContent value="templates">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-1">
              <div className="bg-white rounded-lg border border-[#C3C5D7] overflow-hidden">
                {templates.map(t => (
                  <button
                    key={t.id}
                    className={`w-full text-left px-4 py-3 border-b border-[#C3C5D7] last:border-0 hover:bg-[#F3F3FE] transition-colors ${editingTemplate?.id === t.id ? 'bg-[#D4DCFF]' : ''}`}
                    onClick={() => { setEditingTemplate(t); setTestPhone(''); setTestEmail('') }}
                  >
                    <div className="text-sm font-medium text-[#191B23]">{t.name}</div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <Badge variant="secondary" className="text-xs capitalize px-1.5 py-0">{t.channel}</Badge>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="md:col-span-2">
              {editingTemplate ? (
                <div className="space-y-4">
                  <form onSubmit={handleSaveTemplate} className="bg-white rounded-lg border border-[#C3C5D7] p-5 space-y-4">
                    <h3 className="font-semibold text-[#191B23]">{editingTemplate.name}</h3>
                    {editingTemplate.subject !== null && (
                      <div>
                        <Label>Subject</Label>
                        <Input
                          value={editingTemplate.subject || ''}
                          onChange={e => setEditingTemplate(t => t ? { ...t, subject: e.target.value } : t)}
                          className="border-[#C3C5D7]"
                        />
                      </div>
                    )}
                    <div>
                      <Label>Body</Label>
                      <Textarea
                        value={editingTemplate.body}
                        onChange={e => setEditingTemplate(t => t ? { ...t, body: e.target.value } : t)}
                        rows={8}
                        className="border-[#C3C5D7] font-mono text-xs"
                      />
                      <p className="text-xs text-[#737686] mt-1">
                        Use {'{'}{'}'} placeholders e.g. {'{client_name}'}, {'{booking_ref}'}
                      </p>
                    </div>
                    <Button type="submit" className="bg-[#1A56DB] hover:bg-[#003FB1] rounded-sm">Save Template</Button>
                  </form>

                  {/* Test Send */}
                  <div className="bg-white rounded-lg border border-[#C3C5D7] p-5">
                    <h4 className="text-sm font-semibold text-[#191B23] mb-3 flex items-center gap-1.5">
                      <Send className="w-4 h-4 text-[#1A56DB]" />
                      Test Send
                    </h4>
                    <p className="text-xs text-[#737686] mb-3">
                      Sends the template with dummy data. Fill in one of the fields below.
                    </p>
                    <div className="grid grid-cols-2 gap-3 mb-3">
                      <div>
                        <Label className="text-xs">WhatsApp Number</Label>
                        <Input
                          value={testPhone}
                          onChange={e => setTestPhone(e.target.value)}
                          placeholder="+91 98765 43210"
                          className="border-[#C3C5D7] h-8 text-sm"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Email Address</Label>
                        <Input
                          value={testEmail}
                          onChange={e => setTestEmail(e.target.value)}
                          placeholder="test@example.com"
                          type="email"
                          className="border-[#C3C5D7] h-8 text-sm"
                        />
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-sm gap-1.5"
                      onClick={handleTestSend}
                      disabled={testSending}
                    >
                      <Send className="w-3.5 h-3.5" />
                      {testSending ? 'Sending…' : 'Send Test'}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="bg-white rounded-lg border border-[#C3C5D7] p-8 text-center text-[#737686] text-sm">
                  Select a template to edit
                </div>
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
