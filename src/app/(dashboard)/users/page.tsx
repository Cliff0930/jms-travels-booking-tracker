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
import { Plus, Trash2, UserCheck, UserX } from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import type { UserProfile, UserRole } from '@/types'

const ROLE_CONFIG: Record<UserRole, { label: string; classes: string; desc: string }> = {
  admin:    { label: 'Admin',    classes: 'bg-[#EDE9FE] text-[#7E3AF2]', desc: 'Full access — manage users, companies, all settings' },
  operator: { label: 'Operator', classes: 'bg-[#D4DCFF] text-[#1A56DB]', desc: 'Create & manage bookings, clients, drivers' },
  viewer:   { label: 'Viewer',   classes: 'bg-[#F3F4F6] text-[#6B7280]', desc: 'Read-only — cannot create or edit anything' },
}

export default function UsersPage() {
  const qc = useQueryClient()
  const [showAdd, setShowAdd] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<UserProfile | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', role: 'operator' as UserRole, password: '' })
  const [saving, setSaving] = useState(false)

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
            className="bg-[#1A56DB] hover:bg-[#003FB1] rounded-sm gap-1.5"
            onClick={() => setShowAdd(true)}
          >
            <Plus className="w-4 h-4" /> Add User
          </Button>
        }
      />

      {/* Role reference */}
      <div className="mb-5 grid grid-cols-1 sm:grid-cols-3 gap-2">
        {(Object.entries(ROLE_CONFIG) as [UserRole, typeof ROLE_CONFIG[UserRole]][]).map(([role, cfg]) => (
          <div key={role} className="flex items-start gap-2.5 px-3 py-2.5 rounded-lg bg-white border border-[#C3C5D7]">
            <span className={`mt-0.5 px-2 py-0.5 rounded-full text-xs font-semibold shrink-0 ${cfg.classes}`}>{cfg.label}</span>
            <span className="text-xs text-[#434654]">{cfg.desc}</span>
          </div>
        ))}
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-[#737686]">Loading…</div>
      ) : users.length === 0 ? (
        <div className="py-12 text-center text-[#737686]">No users yet. Add your first user above.</div>
      ) : (
        <div className="bg-white rounded-lg border border-[#C3C5D7] overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#C3C5D7] bg-[#F3F3FE]">
                <th className="text-left px-4 py-2.5 text-label-caps text-[#737686]">User</th>
                <th className="text-left px-4 py-2.5 text-label-caps text-[#737686]">Role</th>
                <th className="text-left px-4 py-2.5 text-label-caps text-[#737686] hidden sm:table-cell">Status</th>
                <th className="text-left px-4 py-2.5 text-label-caps text-[#737686] hidden md:table-cell">Added</th>
                <th className="px-4 py-2.5 text-label-caps text-[#737686] text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(user => {
                const cfg = ROLE_CONFIG[user.role] ?? ROLE_CONFIG.viewer
                const initials = user.name
                  ? user.name.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase()
                  : user.email[0].toUpperCase()
                return (
                  <tr key={user.id} className="border-b border-[#C3C5D7] last:border-0">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-[#D4DCFF] flex items-center justify-center text-xs font-semibold text-[#1A56DB] shrink-0">
                          {initials}
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-[#191B23] truncate">{user.name || '—'}</div>
                          <div className="text-xs text-[#737686] truncate">{user.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Select
                        value={user.role}
                        onValueChange={v => v && updateRole(user.id, v as UserRole)}
                      >
                        <SelectTrigger className="h-7 w-28 border-[#C3C5D7] text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="operator">Operator</SelectItem>
                          <SelectItem value="viewer">Viewer</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${user.is_active ? 'bg-[#D1FAE5] text-[#065F46]' : 'bg-[#F3F4F6] text-[#6B7280]'}`}>
                        {user.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell text-sm text-[#737686]">
                      {format(new Date(user.created_at), 'd MMM yyyy')}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          title={user.is_active ? 'Deactivate user' : 'Activate user'}
                          onClick={() => toggleActive(user)}
                          className="p-1.5 rounded text-[#737686] hover:bg-[#F3F3FE] transition-colors"
                        >
                          {user.is_active
                            ? <UserX className="w-4 h-4" />
                            : <UserCheck className="w-4 h-4 text-[#10B981]" />
                          }
                        </button>
                        <button
                          title="Delete user"
                          onClick={() => setDeleteTarget(user)}
                          className="p-1.5 rounded text-[#737686] hover:bg-red-50 hover:text-red-600 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Add User Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add User</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAdd} className="space-y-3">
            <div>
              <Label className="mb-1.5 block">Full Name</Label>
              <Input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Ravi Kumar"
                className="border-[#C3C5D7]"
              />
            </div>
            <div>
              <Label className="mb-1.5 block">Email Address *</Label>
              <Input
                type="email"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                placeholder="user@company.com"
                required
                className="border-[#C3C5D7]"
              />
            </div>
            <div>
              <Label className="mb-1.5 block">Role *</Label>
              <Select
                value={form.role}
                onValueChange={v => v && setForm(f => ({ ...f, role: v as UserRole }))}
              >
                <SelectTrigger className="border-[#C3C5D7]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin — full access</SelectItem>
                  <SelectItem value="operator">Operator — manage bookings</SelectItem>
                  <SelectItem value="viewer">Viewer — read only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1.5 block">Initial Password *</Label>
              <Input
                type="password"
                value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                placeholder="Min 6 characters"
                required
                minLength={6}
                className="border-[#C3C5D7]"
              />
              <p className="text-xs text-[#737686] mt-1">Share this password with the user. They can change it later.</p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
              <Button type="submit" disabled={saving} className="bg-[#1A56DB] hover:bg-[#003FB1] rounded-sm">
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
    </div>
  )
}
