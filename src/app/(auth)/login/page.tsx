'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import Image from 'next/image'
import { Mail, ArrowLeft } from 'lucide-react'

type View = 'login' | 'forgot' | 'sent'

export default function LoginPage() {
  const router = useRouter()
  const [view, setView] = useState<View>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [resetEmail, setResetEmail] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
      router.push('/')
      router.refresh()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
        redirectTo: `${window.location.origin}/update-password`,
      })
      if (error) throw error
      setView('sent')
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to send reset email')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#FAF8FF]">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <Image src="/icons/icon-512.png" alt="JMS Travels" width={96} height={96} className="rounded-xl mb-2" priority />
          <p className="text-sm text-[#434654]">
            {view === 'login' ? 'Sign in to your workspace' : view === 'forgot' ? 'Reset your password' : 'Check your email'}
          </p>
        </div>

        <div className="bg-white rounded-lg border border-[#C3C5D7] p-6 shadow-sm">
          {view === 'login' && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-[#191B23]">Email address</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  required
                  autoComplete="email"
                  className="border-[#C3C5D7]"
                />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-[#191B23]">Password</Label>
                  <button
                    type="button"
                    onClick={() => { setResetEmail(email); setView('forgot') }}
                    className="text-xs text-[#1A56DB] hover:underline"
                  >
                    Forgot password?
                  </button>
                </div>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                  className="border-[#C3C5D7]"
                />
              </div>
              <Button
                type="submit"
                className="w-full bg-[#1A56DB] hover:bg-[#003FB1] rounded-sm"
                disabled={loading}
              >
                {loading ? 'Signing in…' : 'Sign in'}
              </Button>
            </form>
          )}

          {view === 'forgot' && (
            <form onSubmit={handleForgot} className="space-y-4">
              <p className="text-sm text-[#434654]">Enter your email and we&apos;ll send you a link to reset your password.</p>
              <div className="space-y-1.5">
                <Label htmlFor="reset-email" className="text-[#191B23]">Email address</Label>
                <Input
                  id="reset-email"
                  type="email"
                  value={resetEmail}
                  onChange={e => setResetEmail(e.target.value)}
                  placeholder="you@company.com"
                  required
                  autoComplete="email"
                  className="border-[#C3C5D7]"
                />
              </div>
              <Button
                type="submit"
                className="w-full bg-[#1A56DB] hover:bg-[#003FB1] rounded-sm"
                disabled={loading}
              >
                {loading ? 'Sending…' : 'Send reset link'}
              </Button>
              <button
                type="button"
                onClick={() => setView('login')}
                className="w-full flex items-center justify-center gap-1.5 text-xs text-[#737686] hover:text-[#1A56DB] transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Back to sign in
              </button>
            </form>
          )}

          {view === 'sent' && (
            <div className="space-y-4 text-center">
              <div className="w-14 h-14 rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center mx-auto">
                <Mail className="w-6 h-6 text-[#1A56DB]" />
              </div>
              <div>
                <p className="text-sm font-semibold text-[#191B23]">Reset link sent</p>
                <p className="text-xs text-[#737686] mt-1">
                  We sent a password reset link to <span className="font-medium text-[#434654]">{resetEmail}</span>. Check your inbox.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setView('login')}
                className="w-full flex items-center justify-center gap-1.5 text-xs text-[#737686] hover:text-[#1A56DB] transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Back to sign in
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
