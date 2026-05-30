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
import { Send, Building2, Route, ShieldAlert, Car, Plus, X } from 'lucide-react'
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
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setMorningCutoff(settings.bata_morning_cutoff ?? '06:00')
    setEveningCutoff(settings.bata_evening_cutoff ?? '21:00')
    setGstin(settings.company_gstin ?? '')
    setPan(settings.company_pan ?? '')
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
