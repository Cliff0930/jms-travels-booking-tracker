import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Providers } from './providers'
import { Toaster } from '@/components/ui/sonner'
import { ServiceWorkerRegister } from '@/components/layout/ServiceWorkerRegister'

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' })

export const metadata: Metadata = {
  title: 'CabFlow',
  description: 'Professional cab service management platform',
  manifest: '/manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'CabFlow' },
}

export const viewport: Viewport = {
  themeColor: '#1A56DB',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <Providers>
          {children}
          <Toaster position="top-right" />
          <ServiceWorkerRegister />
        </Providers>
      </body>
    </html>
  )
}
