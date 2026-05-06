import { Sidebar } from '@/components/layout/Sidebar'
import { MobileNav } from '@/components/layout/MobileNav'
import { Header } from '@/components/layout/Header'

const supabaseConfigured =
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_URL !== 'your_supabase_url' &&
  process.env.NEXT_PUBLIC_SUPABASE_URL.startsWith('http')

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  if (supabaseConfigured) {
    const { redirect } = await import('next/navigation')
    const { createClient } = await import('@/lib/supabase/server')
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login')
  }

  return (
    <div className="min-h-screen bg-[#FAF8FF]">
      <Sidebar />
      <Header />
      <main className="md:pl-64 pt-16 pb-20 md:pb-6 min-h-screen">
        <div className="p-4 md:p-6">
          {children}
        </div>
      </main>
      <MobileNav />
    </div>
  )
}
