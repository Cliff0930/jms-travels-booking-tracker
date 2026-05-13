'use client'
import { useEffect, useState } from 'react'
import { Bell, BellOff, BellRing } from 'lucide-react'

type PermState = 'unsupported' | 'default' | 'granted' | 'denied' | 'loading'

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(base64)
  const arr = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i)
  return arr.buffer
}

export function PushSubscribeButton() {
  const [state, setState] = useState<PermState>('loading')

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setState('unsupported')
      return
    }
    setState((Notification.permission as PermState) ?? 'default')
  }, [])

  async function subscribe() {
    setState('loading')
    try {
      const reg = await navigator.serviceWorker.ready
      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
      if (!vapidKey) { setState('unsupported'); return }

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      })

      const json = sub.toJSON()
      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: sub.endpoint,
          keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth },
          label: navigator.userAgent.includes('Mobile') ? 'Mobile' : 'Desktop',
        }),
      })
      setState('granted')
    } catch {
      setState(Notification.permission as PermState)
    }
  }

  async function unsubscribe() {
    setState('loading')
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        await fetch('/api/push/subscribe', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        })
        await sub.unsubscribe()
      }
      setState('default')
    } catch {
      setState('granted')
    }
  }

  if (state === 'unsupported') return null
  if (state === 'loading') return <div className="w-8 h-8" />

  if (state === 'granted') {
    return (
      <button
        onClick={unsubscribe}
        title="Notifications on — click to disable"
        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
      >
        <BellRing className="w-5 h-5" />
      </button>
    )
  }

  if (state === 'denied') {
    return (
      <button
        disabled
        title="Notifications blocked — allow them in browser settings"
        className="p-2 text-gray-300 rounded-lg cursor-not-allowed"
      >
        <BellOff className="w-5 h-5" />
      </button>
    )
  }

  return (
    <button
      onClick={subscribe}
      title="Enable push notifications"
      className="p-2 text-gray-500 hover:bg-gray-50 rounded-lg transition-colors"
    >
      <Bell className="w-5 h-5" />
    </button>
  )
}
