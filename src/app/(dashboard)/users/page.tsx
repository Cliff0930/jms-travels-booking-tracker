'use client'
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { Plus, Trash2, UserCheck, UserX, ShieldCheck, Briefcase, Eye, Mail, CalendarDays, Pencil, Check, X, KeyRound } from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import type { UserProfile, UserRole } from '@/types'

const ROLE_CONFIG: Record<UserRole, {
  label: string
  desc: string
  gradient: string
  pill: string
  icon: React.ElementType
}> = {
  admin:    { label: 'Admin',    desc: 'Full access — manage users, companies, all settings', gradient: 'from-[#7C3AED] to-[#4F46E5]', pill: 'bg-violet-50 text-[#7C3AED] border border-violet-200',  icon: ShieldCheck },
  operator: { label: 'Operator', desc: 'Create & manage bookings, clients, drivers',          gradient: 'from-[#1A56DB] to-[#6366F1]', pill: 'bg-blue-50 text-[#1A56DB] border border-blue-200',    icon: Briefcase   },
  viewer:   { label: 'Viewer',   desc: 'Read-only — cannot create or edit anything',           gradient: 'from-gray-400 to-slate-500',  pill: 'bg-gray-100 text-gray-600 border border-gray-200',   icon: Eye         },
}

export default function UsersPage() {
  const qc = useQueryClient()
  const [showAdd, setShowAdd] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<UserProfile | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', role: 'operator' as UserRole, password: '' })
  const [saving, setSaving] = useState(false)
  const [editingNameId, setEditingNameId] = useState<string | null>(null)
  const [nameInput, setNameInput] = useState('')
  const [savingName, setSavingName] = useState(false)
  const [pwTarget, setPwTarget] = useState<UserProfile | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [settingPw, setSettingPw] = useState(false)

  const { data: users = [], isLoading } = useQuery<UserProfile[]>({
    queryKey: ['users'],
    queryFn: () => fetch('/api/users').then(r => r.json()),
  })

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      qc.invalidateQueries({ queryKey: ['users'] })
      toast.success(`${form.name || form.email} added`)
      setShowAdd(false)
      setForm({ name: '', email: '', role: 'operator', password: '' })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add user')
    } finally {
      setSaving(false)
    }
  }

  async function updateRole(id: string, role: UserRole) {
    try {
      const res = await fetch(`/api/users/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      })
      if (!res.ok) throw new Error()
      qc.invalidateQueries({ queryKey: ['users'] })
      toast.success('Role updated')
    } catch {
      toast.error('Failed to update role')
    }
  }

  async function toggleActive(user: UserProfile) {
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !user.is_active }),
      })
      if (!res.ok) throw new Error()
      qc.invalidateQueries({ queryKey: ['users'] })
      toast.success(user.is_active ? 'User deactivated' : 'User activated')
    } catch {
      toast.error('Failed to update status')
    }
  }

  async function saveNameEdit(id: string) {
    if (!nameInput.trim()) { setEditingNameId(null); return }
    setSavingName(true)
    try {
      const res = await fetch(`/api/users/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nameInput.trim() }),
      })
      if (!res.ok) throw new Error()
      qc.invalidateQueries({ queryKey: ['users'] })
      toast.success('Name updated')
      setEditingNameId(null)
    } catch {
      toast.error('Failed to update name')
    } finally {
      setSavingName(false)
    }
  }

  async function handleSetPassword(e: React.FormEvent) {
    e.preventDefault()
    if (!pwTarget || newPassword.length < 8) return
    setSettingPw(true)
    try {
      const res = await fetch(`/api/users/${pwTarget.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: newPassword }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast.success('Password updated')
      setPwTarget(null)
      setNewPassword('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to set password')
    } finally {
      setSettingPw(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/users/${deleteTarget.id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      qc.invalidateQueries({ queryKey: ['users'] })
      toast.success('User deleted')
      setDeleteTarget(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete user')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="Users"
        description={`${users.length} user${users.length === 1 ? '' : 's'}`}
        actions={
          <Button
            size="sm"
            className="bg-gradient-to-r from-[#1A56DB] to-[#6366F1] hover:from-[#1648c5] hover:to-[#4F46E5] rounded-sm gap-1.5 shadow-sm"
            onClick={() => setShowAdd(true)}
          >
            <Plus className="w-4 h-4" /> Add User
          </Button>
        }
      />

      {/* Role legend */}
      <div className="mb-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
        {(Object.entries(ROLE_CONFIG) as [UserRole, typeof ROLE_CONFIG[UserRole]][]).map(([, cfg]) => {
          const Icon = cfg.icon
          return (
            <div key={cfg.label} className="flex items-start gap-3 p-3 rounded-xl bg-white border border-[#E5E7EB] hover:shadow-sm transition-shadow">
              <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${cfg.gradient} flex items-center justify-center shrink-0 shadow-sm`}>
                <Icon className="w-4 h-4 text-white" />
              </div>
              <div>
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${cfg.pill}`}>{cfg.label}</span>
                <p className="text-xs text-[#737686] mt-1 leading-snug">{cfg.desc}</p>
              </div>
            </div>
          )
        })}
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-[#737686]">Loading…</div>
      ) : users.length === 0 ? (
        <div className="py-12 text-center text-[#737686]">No users yet. Add your first user above.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {users.map(user => {
            const cfg = ROLE_CONFIG[user.role] ?? ROLE_CONFIG.viewer
            const Icon = cfg.icon
            const initials = user.name
              ? user.name.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase()
              : user.email[0].toUpperCase()
            return (
              <div key={user.id} className={`bg-white rounded-2xl border border-[#E5E7EB] overflow-hidden hover:shadow-lg hover:-translate-y-0.5 transition-all ${!user.is_active ? 'opacity-70' : ''}`}>
                {/* Card header with gradient */}
                <div className={`bg-gradient-to-br ${cfg.gradient} px-4 pt-4 pb-5`}>
                  <div className="flex items-start justify-between">
                    <div className="w-14 h-14 rounded-xl bg-white/20 border-2 border-white/40 flex items-center justify-center text-xl font-bold text-white">
                      {initials}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${user.is_active ? 'bg-white/20 text-white' : 'bg-white/10 text-white/60'}`}>
                        {user.is_active ? '● Active' : '○ Inactive'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Card body */}
                <div className="px-4 pt-3 pb-4 -mt-2">
                  <div className="bg-white rounded-xl border border-[#E5E7EB] p-3 mb-3 shadow-sm">
                    {editingNameId === user.id ? (
                      <div className="flex items-center gap-1.5 mb-1">
                        <input
                          autoFocus
                          value={nameInput}
                          onChange={e => setNameInput(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') saveNameEdit(user.id)
                            if (e.key === 'Escape') setEditingNameId(null)
                          }}
                          className="flex-1 text-sm font-semibold text-[#191B23] border border-[#1A56DB] rounded-md px-2 py-0.5 outline-none min-w-0"
                          placeholder="Enter name"
                        />
                        <button
                          onClick={() => saveNameEdit(user.id)}
                          disabled={savingName}
                          className="w-6 h-6 flex items-center justify-center rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition-colors shrink-0"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setEditingNameId(null)}
                          className="w-6 h-6 flex items-center justify-center rounded bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors shrink-0"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 mb-0.5 group/name">
                        <span className="text-sm font-semibold text-[#191B23] truncate flex-1">{user.name || <span className="text-[#9CA3AF] font-normal italic">No name set</span>}</span>
                        <button
                          onClick={() => { setEditingNameId(user.id); setNameInput(user.name || '') }}
                          className="opacity-0 group-hover/name:opacity-100 transition-opacity p-1 rounded hover:bg-blue-50 text-[#737686] hover:text-[#1A56DB] shrink-0"
                          title="Edit name"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                    <div className="flex items-center gap-1.5 mt-0.5 text-xs text-[#737686]">
                      <Mail className="w-3 h-3 shrink-0" />
                      <span className="truncate">{user.email}</span>
                    </div>
                    {user.created_at && (
                      <div className="flex items-center gap-1.5 mt-0.5 text-xs text-[#9CA3AF]">
                        <CalendarDays className="w-3 h-3 shrink-0" />
                        <span>Joined {format(new Date(user.created_at), 'd MMM yyyy')}</span>
                      </div>
                    )}
                  </div>

                  {/* Role selector */}
                  <div className="flex items-center gap-2 mb-3">
                    <Icon className="w-3.5 h-3.5 text-[#737686] shrink-0" />
                    <Select
                      value={user.role}
                      onValueChange={v => v && updateRole(user.id, v as UserRole)}
                    >
                      <SelectTrigger className="h-7 flex-1 border-[#C3C5D7] text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="operator">Operator</SelectItem>
                        <SelectItem value="viewer">Viewer</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2">
                    <button
                      title={user.is_active ? 'Deactivate user' : 'Activate user'}
                      onClick={() => toggleActive(user)}
                      className={`flex-1 flex items-center justify-center gap-1.5 h-8 rounded-lg text-xs font-medium border transition-colors ${
                        user.is_active
                          ? 'border-amber-200 text-amber-700 bg-amber-50 hover:bg-amber-100'
                          : 'border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100'
                      }`}
                    >
                      {user.is_active
                        ? <><UserX className="w-3.5 h-3.5" /> Deactivate</>
                        : <><UserCheck className="w-3.5 h-3.5" /> Activate</>
                      }
                    </button>
                    <button
                      title="Set password"
                      onClick={() => { setPwTarget(user); setNewPassword('') }}
                      className="w-8 h-8 flex items-center justify-center rounded-lg border border-blue-200 text-[#1A56DB] bg-blue-50 hover:bg-blue-100 transition-colors"
                    >
                      <KeyRound className="w-3.5 h-3.5" />
                    </button>
                    <button
                      title="Delete user"
                      onClick={() => setDeleteTarget(user)}
                      className="w-8 h-8 flex items-center justify-center rounded-lg border border-red-200 text-red-500 bg-red-50 hover:bg-red-100 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Add User Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#1A56DB] to-[#6366F1] flex items-center justify-center">
                <Plus className="w-4 h-4 text-white" />
              </div>
              Add New User
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAdd} className="space-y-4 pt-1">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="mb-1.5 block text-xs font-semibold text-[#434654]">Full Name</Label>
                <Input
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Ravi Kumar"
                  className="border-[#C3C5D7] h-9"
                />
              </div>
              <div>
                <Label className="mb-1.5 block text-xs font-semibold text-[#434654]">Email Address *</Label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="user@company.com"
                  required
                  className="border-[#C3C5D7] h-9"
                />
              </div>
            </div>

            <div>
              <Label className="mb-1.5 block text-xs font-semibold text-[#434654]">Role *</Label>
              <Select value={form.role} onValueChange={v => v && setForm(f => ({ ...f, role: v as UserRole }))}>
                <SelectTrigger className="border-[#C3C5D7]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin — full access</SelectItem>
                  <SelectItem value="operator">Operator — manage bookings</SelectItem>
                  <SelectItem value="viewer">Viewer — read only</SelectItem>
                </SelectContent>
              </Select>
              {/* Role preview */}
              <div className={`mt-2 flex items-start gap-2.5 p-2.5 rounded-lg bg-gradient-to-br ${ROLE_CONFIG[form.role].gradient} bg-opacity-10`}>
                <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${ROLE_CONFIG[form.role].gradient} flex items-center justify-center shrink-0`}>
                  {(() => { const Icon = ROLE_CONFIG[form.role].icon; return <Icon className="w-3.5 h-3.5 text-white" /> })()}
                </div>
                <p className="text-xs text-[#434654] leading-snug pt-0.5">{ROLE_CONFIG[form.role].desc}</p>
              </div>
            </div>

            <div>
              <Label className="mb-1.5 block text-xs font-semibold text-[#434654]">Initial Password *</Label>
              <Input
                type="password"
                value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                placeholder="Min 6 characters"
                required
                minLength={6}
                className="border-[#C3C5D7] h-9"
              />
              <p className="text-xs text-[#737686] mt-1">Share this with the user — they can change it after first login.</p>
            </div>

            <DialogFooter className="pt-1">
              <Button type="button" variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
              <Button
                type="submit"
                disabled={saving || !form.email.trim() || !form.password.trim()}
                className="bg-gradient-to-r from-[#1A56DB] to-[#6366F1] hover:from-[#1648c5] hover:to-[#4F46E5] rounded-sm"
              >
                {saving ? 'Adding…' : 'Add User'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={o => !o && setDeleteTarget(null)}
        title="Delete user"
        description={`Remove ${deleteTarget?.name || deleteTarget?.email} permanently? This cannot be undone and they will lose access immediately.`}
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleDelete}
        loading={deleting}
      />

      {/* Set Password Dialog */}
      <Dialog open={!!pwTarget} onOpenChange={o => !o && setPwTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#1A56DB] to-[#6366F1] flex items-center justify-center">
                <KeyRound className="w-4 h-4 text-white" />
              </div>
              Set Password
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSetPassword} className="space-y-4 pt-1">
            <p className="text-xs text-[#737686]">
              Setting a new password for <span className="font-semibold text-[#434654]">{pwTarget?.name || pwTarget?.email}</span>. They will need to use this password on their next sign in.
            </p>
            <div>
              <Label className="mb-1.5 block text-xs font-semibold text-[#434654]">New Password</Label>
              <Input
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="Min. 8 characters"
                required
                minLength={8}
                autoFocus
                className="border-[#C3C5D7] h-9"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setPwTarget(null)}>Cancel</Button>
              <Button
                type="submit"
                disabled={settingPw || newPassword.length < 8}
                className="bg-[#1A56DB] hover:bg-[#003FB1] rounded-sm"
              >
                {settingPw ? 'Saving…' : 'Set Password'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
