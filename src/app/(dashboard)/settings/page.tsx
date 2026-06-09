'use client'
import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Send, Building2, Route, ShieldAlert, Car, Plus, X, Mail, MessageCircle } from 'lucide-react'
import { useIsAdmin } from '@/hooks/useCurrentUser'
import { toast } from 'sonner'
import type { MessageTemplate } from '@/types'

export default function SettingsPage() {
  const qc = useQueryClient()
  const isAdmin = useIsAdmin()
  const [editingTemplate, setEditingTemplate] = useState<MessageTemplate | null>(null)
  const [testPhone, setTestPhone] = useState('')
  const [testEmail, setTestEmail] = useState('')
  const [testSending, setTestSending] = useState(false)

  // General settings
  const [officeName, setOfficeName] = useState('')
  const [officeAddress, setOfficeAddress] = useState('')
  const [distanceEnabled, setDistanceEnabled] = useState(true)
  const [aiEnabled, setAiEnabled] = useState(true)
  const [savingGeneral, setSavingGeneral] = useState(false)

  const { data: generalSettings } = useQuery<Record<string, string>>({
    queryKey: ['app-settings'],
    queryFn: () => fetch('/api/settings').then(r => r.json()),
  })

  useEffect(() => {
    if (!generalSettings) return
    if (generalSettings.office_location) {
      try {
        const parsed = JSON.parse(generalSettings.office_location) as { name?: string; address?: string }
        setOfficeName(parsed.name || '')
        setOfficeAddress(parsed.address || '')
      } catch { /* ignore */ }
    }
    if (generalSettings.distance_calculation_enabled !== undefined) {
      setDistanceEnabled(generalSettings.distance_calculation_enabled !== 'false')
    }
    if (generalSettings.ai_processing_enabled !== undefined) {
      setAiEnabled(generalSettings.ai_processing_enabled !== 'false')
    }
  }, [generalSettings])

  async function handleSaveGeneral() {
    setSavingGeneral(true)
    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          office_location: JSON.stringify({ name: officeName.trim(), address: officeAddress.trim() }),
          distance_calculation_enabled: distanceEnabled ? 'true' : 'false',
        }),
      })
      qc.invalidateQueries({ queryKey: ['app-settings'] })
      toast.success('Settings saved')
    } catch {
      toast.error('Failed to save settings')
    } finally {
      setSavingGeneral(false)
    }
  }

  async function handleToggleDistance(enabled: boolean) {
    setDistanceEnabled(enabled)
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ distance_calculation_enabled: enabled ? 'true' : 'false' }),
    }).catch(() => toast.error('Failed to update setting'))
  }

  async function handleToggleAi(enabled: boolean) {
    setAiEnabled(enabled)
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ai_processing_enabled: enabled ? 'true' : 'false' }),
    }).catch(() => toast.error('Failed to update setting'))
    toast[enabled ? 'success' : 'warning'](
      enabled ? 'AI processing resumed' : 'AI processing stopped — messages will queue, no Gemini calls'
    )
  }

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
      <Tabs defaultValue="general">
        <TabsList className="bg-[#EDEDF8] mb-5 h-auto flex-wrap">
          <TabsTrigger value="general" className="data-[state=active]:bg-white">General</TabsTrigger>
          <TabsTrigger value="templates" className="data-[state=active]:bg-white">Message Templates</TabsTrigger>
          <TabsTrigger value="vehicle-names" className="data-[state=active]:bg-white">Vehicle Names</TabsTrigger>
          <TabsTrigger value="billing" className="data-[state=active]:bg-white">Billing</TabsTrigger>
          <TabsTrigger value="send-templates" className="data-[state=active]:bg-white">Send Templates</TabsTrigger>
        </TabsList>

        <TabsContent value="general">
          <div className="space-y-5">

            {/* AI Kill Switch */}
            <div className={`rounded-lg border p-5 ${aiEnabled ? 'bg-white border-[#C3C5D7]' : 'bg-red-50 border-red-300'}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-start gap-2">
                  <ShieldAlert className={`w-4 h-4 mt-0.5 shrink-0 ${aiEnabled ? 'text-[#1A56DB]' : 'text-red-600'}`} />
                  <div>
                    <h3 className={`font-semibold ${aiEnabled ? 'text-[#191B23]' : 'text-red-700'}`}>AI Processing</h3>
                    <p className={`text-sm mt-0.5 ${aiEnabled ? 'text-[#737686]' : 'text-red-600'}`}>
                      {aiEnabled
                        ? 'WhatsApp and email bookings are being processed automatically by Gemini.'
                        : 'STOPPED — Gemini is disabled. Messages are saved but not processed. No bookings will be auto-created.'}
                    </p>
                  </div>
                </div>
                <Switch
                  checked={aiEnabled}
                  onCheckedChange={isAdmin ? handleToggleAi : undefined}
                  disabled={!isAdmin}
                  className="ml-4 shrink-0"
                />
              </div>
            </div>

            <div className="bg-white rounded-lg border border-[#C3C5D7] p-5 space-y-4">
              <div className="flex items-center gap-2 mb-1">
                <Building2 className="w-4 h-4 text-[#1A56DB]" />
                <h3 className="font-semibold text-[#191B23]">Office Location</h3>
              </div>
              <p className="text-sm text-[#737686] -mt-2">Used to calculate distance from office to pickup and from drop back to office on each trip.</p>
              <div>
                <Label>Company Name</Label>
                <Input
                  value={officeName}
                  onChange={e => setOfficeName(e.target.value)}
                  placeholder="e.g. JMS Travels"
                  className="mt-1 border-[#C3C5D7]"
                />
              </div>
              <div>
                <Label>Office Address</Label>
                <Input
                  value={officeAddress}
                  onChange={e => setOfficeAddress(e.target.value)}
                  placeholder="e.g. 123 MG Road, Bangalore, Karnataka 560001"
                  className="mt-1 border-[#C3C5D7]"
                />
                <p className="text-xs text-[#737686] mt-1">Enter the full address including city and state for accurate distance calculation.</p>
              </div>
              <Button onClick={handleSaveGeneral} disabled={savingGeneral || !isAdmin} className="bg-[#1A56DB] hover:bg-[#003FB1] rounded-sm">
                {savingGeneral ? 'Saving…' : 'Save Office Location'}
              </Button>
            </div>

            <div className="bg-white rounded-lg border border-[#C3C5D7] p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-start gap-2">
                  <Route className="w-4 h-4 text-[#1A56DB] mt-0.5 shrink-0" />
                  <div>
                    <h3 className="font-semibold text-[#191B23]">Office Distance Calculation</h3>
                    <p className="text-sm text-[#737686] mt-0.5">
                      Uses Google Maps to calculate KM between office and trip locations.
                      Disable to reduce API costs ($5 per 1,000 trips — free up to 2,000/month).
                    </p>
                  </div>
                </div>
                <Switch
                  checked={distanceEnabled}
                  onCheckedChange={isAdmin ? handleToggleDistance : undefined}
                  disabled={!isAdmin}
                  className="ml-4 shrink-0"
                />
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="billing">
          <BillingSettings settings={generalSettings ?? {}} />
        </TabsContent>

        <TabsContent value="templates">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-1">
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

            <div className="lg:col-span-2">
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
                    <Button type="submit" disabled={!isAdmin} className="bg-[#1A56DB] hover:bg-[#003FB1] rounded-sm">Save Template</Button>
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
                      disabled={testSending || !isAdmin}
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

        <TabsContent value="vehicle-names">
          <VehicleNamesTab />
        </TabsContent>

        <TabsContent value="send-templates">
          <SendTemplatesTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function BillingSettings({ settings }: { settings: Record<string, string> }) {
  const qc = useQueryClient()
  const [morningCutoff, setMorningCutoff] = useState(settings.bata_morning_cutoff ?? '06:00')
  const [eveningCutoff, setEveningCutoff] = useState(settings.bata_evening_cutoff ?? '21:00')
  const [gstin, setGstin] = useState(settings.company_gstin ?? '')
  const [pan, setPan] = useState(settings.company_pan ?? '')
  const [interestRate, setInterestRate] = useState(settings.advance_interest_rate_pct ?? '2')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setMorningCutoff(settings.bata_morning_cutoff ?? '06:00')
    setEveningCutoff(settings.bata_evening_cutoff ?? '21:00')
    setGstin(settings.company_gstin ?? '')
    setPan(settings.company_pan ?? '')
    setInterestRate(settings.advance_interest_rate_pct ?? '2')
  }, [settings])

  async function saveSetting(key: string, value: string) {
    await fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key, value }) })
    qc.invalidateQueries({ queryKey: ['app-settings'] })
  }

  async function handleSave() {
    setSaving(true)
    await Promise.all([
      saveSetting('bata_morning_cutoff', morningCutoff),
      saveSetting('bata_evening_cutoff', eveningCutoff),
      saveSetting('company_gstin', gstin),
      saveSetting('company_pan', pan),
      saveSetting('advance_interest_rate_pct', interestRate),
    ])
    toast.success('Billing settings saved')
    setSaving(false)
  }

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-lg border border-[#C3C5D7] p-5 space-y-4">
        <h3 className="font-semibold text-[#191B23]">Bata Cutoff Times</h3>
        <p className="text-sm text-[#737686]">Trips starting before morning cutoff or ending after evening cutoff qualify for extra bata. Default: 06:00 AM / 21:00 PM.</p>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Morning Bata — Trip starts before</Label>
            <Input type="time" value={morningCutoff} onChange={e => setMorningCutoff(e.target.value)} className="w-40" />
            <p className="text-xs text-[#737686]">e.g. 06:00 means trips before 6 AM get bata</p>
          </div>
          <div className="space-y-1.5">
            <Label>Evening Bata — Trip ends after</Label>
            <Input type="time" value={eveningCutoff} onChange={e => setEveningCutoff(e.target.value)} className="w-40" />
            <p className="text-xs text-[#737686]">e.g. 21:00 means trips ending after 9 PM get bata</p>
          </div>
        </div>
      </div>
      <div className="bg-white rounded-lg border border-[#C3C5D7] p-5 space-y-4">
        <h3 className="font-semibold text-[#191B23]">Company Billing Details</h3>
        <p className="text-sm text-[#737686]">Shown on invoice headers. SAC Code: 996601 (fixed). State: Karnataka (29).</p>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Company GSTIN</Label>
            <Input value={gstin} onChange={e => setGstin(e.target.value.toUpperCase())} placeholder="29XXXXX0000X1ZX" maxLength={15} />
          </div>
          <div className="space-y-1.5">
            <Label>PAN Number</Label>
            <Input value={pan} onChange={e => setPan(e.target.value.toUpperCase())} placeholder="AAAAA0000A" maxLength={10} />
          </div>
        </div>
      </div>
      <div className="bg-white rounded-lg border border-[#C3C5D7] p-5 space-y-4">
        <h3 className="font-semibold text-[#191B23]">Driver Settlement</h3>
        <p className="text-sm text-[#737686]">Interest charged on driver advances. Applied monthly on the outstanding balance when generating a driver statement.</p>
        <div className="flex items-center gap-3">
          <div className="space-y-1.5">
            <Label>Advance Interest Rate (% per month)</Label>
            <div className="flex items-center gap-2">
              <Input type="number" min="0" max="100" step="0.5" value={interestRate} onChange={e => setInterestRate(e.target.value)} className="w-28" />
              <span className="text-sm text-[#737686]">% / month</span>
            </div>
            <p className="text-xs text-[#737686]">e.g. 2 means 2% per month on outstanding advance balance</p>
          </div>
        </div>
      </div>
      <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save Billing Settings'}</Button>
    </div>
  )
}

function VehicleNamesTab() {
  const qc = useQueryClient()
  const [newName, setNewName] = useState('')
  const [saving, setSaving] = useState(false)

  const { data: vehicleNames = [], isLoading } = useQuery<{ id: string; name: string }[]>({
    queryKey: ['vehicle-names'],
    queryFn: () => fetch('/api/vehicle-names').then(r => r.json()),
  })

  async function handleAdd() {
    if (!newName.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/vehicle-names', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim() }),
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      qc.invalidateQueries({ queryKey: ['vehicle-names'] })
      setNewName('')
      toast.success('Vehicle name added')
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to add')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    try {
      await fetch(`/api/vehicle-names/${id}`, { method: 'DELETE' })
      qc.invalidateQueries({ queryKey: ['vehicle-names'] })
      toast.success('Removed')
    } catch {
      toast.error('Failed to remove')
    }
  }

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-lg border border-[#C3C5D7] p-5">
        <div className="flex items-center gap-2 mb-1">
          <Car className="w-4 h-4 text-[#1A56DB]" />
          <h3 className="font-semibold text-[#191B23]">Vehicle Names</h3>
        </div>
        <p className="text-sm text-[#737686] mb-4">
          Standardized vehicle names used across driver profiles and company bata rates. All drivers should use names from this list so bata rate lookups match correctly.
        </p>

        <div className="flex gap-2 mb-4">
          <Input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            placeholder="e.g. Toyota Innova Crysta"
            className="border-[#C3C5D7] h-8 text-sm max-w-xs"
          />
          <Button
            size="sm"
            className="bg-[#1A56DB] hover:bg-[#003FB1] rounded-sm gap-1.5 h-8"
            onClick={handleAdd}
            disabled={saving || !newName.trim()}
          >
            <Plus className="w-3.5 h-3.5" /> Add
          </Button>
        </div>

        {isLoading ? (
          <p className="text-sm text-[#737686]">Loading…</p>
        ) : vehicleNames.length === 0 ? (
          <p className="text-sm text-[#737686]">No vehicle names yet. Add your first one above.</p>
        ) : (
          <div className="space-y-1.5">
            {vehicleNames.map(v => (
              <div key={v.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-[#F3F3FE] border border-[#C3C5D7]">
                <div className="flex items-center gap-2">
                  <Car className="w-3.5 h-3.5 text-[#737686]" />
                  <span className="text-sm text-[#191B23] font-medium">{v.name}</span>
                </div>
                <button onClick={() => handleDelete(v.id)} className="text-[#737686] hover:text-red-500 transition-colors">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

const INVOICE_VARS = [
  { key: '{{docNumber}}', desc: 'Invoice number' },
  { key: '{{clientName}}', desc: 'Company / client name' },
  { key: '{{period}}', desc: 'Billing period' },
  { key: '{{amount}}', desc: 'Invoice amount (₹)' },
  { key: '{{dueDate}}', desc: 'Payment due date' },
]

const CASHBILL_VARS = [
  { key: '{{docNumber}}', desc: 'Bill number' },
  { key: '{{clientName}}', desc: 'Client name' },
  { key: '{{period}}', desc: 'Billing period' },
  { key: '{{amount}}', desc: 'Bill amount (₹)' },
]

function VarsHelp({ vars, onInsert }: { vars: { key: string; desc: string }[]; onInsert: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs text-[#737686]">Available variables — click to insert at cursor:</p>
      <div className="flex flex-wrap gap-1.5">
        {vars.map(v => (
          <button
            key={v.key}
            type="button"
            onClick={() => onInsert(v.key)}
            title={v.desc}
            className="font-mono text-xs bg-[#EEF2FF] text-[#1A56DB] border border-[#C3C5D7] rounded px-2 py-0.5 hover:bg-[#D4DCFF] transition-colors"
          >
            {v.key}
          </button>
        ))}
      </div>
    </div>
  )
}

function SendTemplatesTab() {
  const isAdmin = useIsAdmin()
  const qc = useQueryClient()
  const [saving, setSaving] = useState<string | null>(null)

  const [invEmailSubject, setInvEmailSubject] = useState('')
  const [invEmailBody, setInvEmailBody] = useState('')
  const [invWaMessage, setInvWaMessage] = useState('')
  const [cbEmailSubject, setCbEmailSubject] = useState('')
  const [cbEmailBody, setCbEmailBody] = useState('')
  const [cbWaMessage, setCbWaMessage] = useState('')
  const [loaded, setLoaded] = useState(false)

  const { data: settings } = useQuery<Record<string, string>>({
    queryKey: ['app-settings'],
    queryFn: () => fetch('/api/settings').then(r => r.json()),
  })

  useEffect(() => {
    if (!settings || loaded) return
    setInvEmailSubject(settings.send_invoice_email_subject ?? '')
    setInvEmailBody(settings.send_invoice_email_body ?? '')
    setInvWaMessage(settings.send_invoice_wa_message ?? '')
    setCbEmailSubject(settings.send_cashbill_email_subject ?? '')
    setCbEmailBody(settings.send_cashbill_email_body ?? '')
    setCbWaMessage(settings.send_cashbill_wa_message ?? '')
    setLoaded(true)
  }, [settings, loaded])

  async function save(keys: Record<string, string>, label: string) {
    setSaving(label)
    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(keys),
      })
      qc.invalidateQueries({ queryKey: ['app-settings'] })
      toast.success('Template saved')
    } catch {
      toast.error('Failed to save template')
    } finally {
      setSaving(null)
    }
  }

  const sectionCls = 'bg-white rounded-xl border border-[#C3C5D7] p-5 space-y-5'
  const subCls = 'border border-[#C3C5D7] rounded-lg p-4 space-y-3'

  return (
    <div className="space-y-6">
      <p className="text-sm text-[#737686]">
        Customise the default email and WhatsApp messages used when sending invoices and cash bills.
        Leave fields blank to use the system default. Use <code className="bg-[#F3F3FE] px-1 rounded text-xs">{'{{variable}}'}</code> placeholders — they are replaced with the actual invoice data when the dialog opens.
      </p>

      {/* Invoice templates */}
      <div className={sectionCls}>
        <h3 className="font-semibold text-[#191B23]">Invoice (GST) Templates</h3>

        {/* Email */}
        <div className={subCls}>
          <div className="flex items-center gap-2 text-sm font-medium text-[#191B23]">
            <Mail className="w-4 h-4 text-[#1A56DB]" /> Email Template
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-[#737686]">Subject</Label>
            <Input
              value={invEmailSubject}
              onChange={e => setInvEmailSubject(e.target.value)}
              placeholder="Invoice {{docNumber}} — JMS Travels"
              className="border-[#C3C5D7]"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-[#737686]">Body</Label>
            <Textarea
              value={invEmailBody}
              onChange={e => setInvEmailBody(e.target.value)}
              rows={9}
              placeholder={'Dear {{clientName}},\n\nPlease find attached Invoice {{docNumber}} for the period {{period}}.\n\nAmount: {{amount}}\nDue Date: {{dueDate}}\n\nThank you,\nJMS Travels'}
              className="border-[#C3C5D7] font-mono text-xs"
            />
          </div>
          <VarsHelp vars={INVOICE_VARS} onInsert={v => setInvEmailBody(b => b + v)} />
          <Button
            size="sm"
            disabled={!isAdmin || saving === 'inv-email'}
            className="bg-[#1A56DB] hover:bg-[#003FB1] rounded-sm"
            onClick={() => save({ send_invoice_email_subject: invEmailSubject, send_invoice_email_body: invEmailBody }, 'inv-email')}
          >
            {saving === 'inv-email' ? 'Saving…' : 'Save Email Template'}
          </Button>
        </div>

        {/* WhatsApp */}
        <div className={subCls}>
          <div className="flex items-center gap-2 text-sm font-medium text-[#191B23]">
            <MessageCircle className="w-4 h-4 text-green-600" /> WhatsApp Template
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-[#737686]">Message</Label>
            <Textarea
              value={invWaMessage}
              onChange={e => setInvWaMessage(e.target.value)}
              rows={8}
              placeholder={'Dear {{clientName}},\n\nInvoice *{{docNumber}}* for {{period}}.\n💰 Amount: {{amount}}\n📅 Due: {{dueDate}}\n\nJMS Travels 📞 9845572207'}
              className="border-[#C3C5D7] font-mono text-xs"
            />
          </div>
          <VarsHelp vars={INVOICE_VARS} onInsert={v => setInvWaMessage(m => m + v)} />
          <Button
            size="sm"
            disabled={!isAdmin || saving === 'inv-wa'}
            className="bg-green-600 hover:bg-green-700 rounded-sm"
            onClick={() => save({ send_invoice_wa_message: invWaMessage }, 'inv-wa')}
          >
            {saving === 'inv-wa' ? 'Saving…' : 'Save WhatsApp Template'}
          </Button>
        </div>
      </div>

      {/* Cash Bill templates */}
      <div className={sectionCls}>
        <h3 className="font-semibold text-[#191B23]">Cash Bill Templates</h3>

        {/* Email */}
        <div className={subCls}>
          <div className="flex items-center gap-2 text-sm font-medium text-[#191B23]">
            <Mail className="w-4 h-4 text-[#1A56DB]" /> Email Template
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-[#737686]">Subject</Label>
            <Input
              value={cbEmailSubject}
              onChange={e => setCbEmailSubject(e.target.value)}
              placeholder="Cash Bill {{docNumber}} — JMS Travels"
              className="border-[#C3C5D7]"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-[#737686]">Body</Label>
            <Textarea
              value={cbEmailBody}
              onChange={e => setCbEmailBody(e.target.value)}
              rows={9}
              placeholder={'Dear {{clientName}},\n\nPlease find attached Cash Bill {{docNumber}} for the period {{period}}.\n\nAmount: {{amount}}\n\nThank you,\nJMS Travels'}
              className="border-[#C3C5D7] font-mono text-xs"
            />
          </div>
          <VarsHelp vars={CASHBILL_VARS} onInsert={v => setCbEmailBody(b => b + v)} />
          <Button
            size="sm"
            disabled={!isAdmin || saving === 'cb-email'}
            className="bg-[#1A56DB] hover:bg-[#003FB1] rounded-sm"
            onClick={() => save({ send_cashbill_email_subject: cbEmailSubject, send_cashbill_email_body: cbEmailBody }, 'cb-email')}
          >
            {saving === 'cb-email' ? 'Saving…' : 'Save Email Template'}
          </Button>
        </div>

        {/* WhatsApp */}
        <div className={subCls}>
          <div className="flex items-center gap-2 text-sm font-medium text-[#191B23]">
            <MessageCircle className="w-4 h-4 text-green-600" /> WhatsApp Template
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-[#737686]">Message</Label>
            <Textarea
              value={cbWaMessage}
              onChange={e => setCbWaMessage(e.target.value)}
              rows={8}
              placeholder={'Dear {{clientName}},\n\nCash Bill *{{docNumber}}* for {{period}}.\n💰 Amount: {{amount}}\n\nJMS Travels 📞 9845572207'}
              className="border-[#C3C5D7] font-mono text-xs"
            />
          </div>
          <VarsHelp vars={CASHBILL_VARS} onInsert={v => setCbWaMessage(m => m + v)} />
          <Button
            size="sm"
            disabled={!isAdmin || saving === 'cb-wa'}
            className="bg-green-600 hover:bg-green-700 rounded-sm"
            onClick={() => save({ send_cashbill_wa_message: cbWaMessage }, 'cb-wa')}
          >
            {saving === 'cb-wa' ? 'Saving…' : 'Save WhatsApp Template'}
          </Button>
        </div>
      </div>
    </div>
  )
}
