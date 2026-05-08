'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import Image from 'next/image'
import { ShieldCheck } from 'lucide-react'

export default function UpdatePasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    // Supabase handles the token from the URL hash and sets the session automatically.
    // We just need to wait for the auth state to settle.
    const supabase = createClient()
    supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setReady(true)
    })
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) { toast.error('Passwords do not match'); return }
    if (password.length < 8) { toast.error('Password must be at least 8 characters'); return }
    setLoading(true)
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error
      toast.success('Password updated — please sign in')
      router.push('/login')
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to update password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#FAF8FF]">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <Image src="/icons/icon-512.png" alt="JMS Travels" width={96} height={96} className="rounded-xl mb-2" priority />
          <p className="text-sm text-[#434654]">Set a new password</p>
        </div>

        <div className="bg-white rounded-lg border border-[#C3C5D7] p-6 shadow-sm">
          {!ready ? (
            <div className="text-center space-y-3 py-2">
              <div className="w-14 h-14 rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center mx-auto">
                <ShieldCheck className="w-6 h-6 text-[#1A56DB]" />
              </div>
              <p className="text-sm text-[#434654]">Verifying your reset link…</p>
              <p className="text-xs text-[#737686]">If this takes too long, your link may have expired. Request a new one from the login page.</p>
              <Button variant="outline" size="sm" onClick={() => router.push('/login')} className="w-full">
                Back to sign in
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="new-password" className="text-[#191B23]">New password</Label>
                <Input
                  id="new-password"
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Min. 8 characters"
                  required
                  autoComplete="new-password"
                  className="border-[#C3C5D7]"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirm-password" className="text-[#191B23]">Confirm password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  placeholder="Repeat password"
                  required
                  autoComplete="new-password"
                  className="border-[#C3C5D7]"
                />
              </div>
              <Button
                type="submit"
                className="w-full bg-[#1A56DB] hover:bg-[#003FB1] rounded-sm"
                disabled={loading}
              >
                {loading ? 'Updating…' : 'Update password'}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
