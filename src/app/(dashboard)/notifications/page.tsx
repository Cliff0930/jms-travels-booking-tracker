'use client'
import { useEffect, useState } from 'react'
import { Bell, CheckCheck, AlertCircle, BookOpen } from 'lucide-react'

type Notification = {
  id: string
  title: string
  body: string
  channel: 'alerts' | 'ops'
  read_at: string | null
  created_at: string
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  useEffect(() => {
    fetch('/api/notifications')
      .then(r => r.json())
      .then(data => { setNotifications(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  async function markAllRead() {
    await fetch('/api/notifications', { method: 'POST' })
    setNotifications(prev => prev.map(n => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })))
  }

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const unreadCount = notifications.filter(n => !n.read_at).length

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Bell className="w-5 h-5 text-gray-700" />
          <h1 className="text-xl font-bold text-gray-900">Notifications</h1>
          {unreadCount > 0 && (
            <span className="bg-blue-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">
              {unreadCount}
            </span>
          )}
        </div>
        {unreadCount > 0 && (
          <button
            onClick={markAllRead}
            className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 font-semibold"
          >
            <CheckCheck className="w-4 h-4" />
            Mark all read
          </button>
        )}
      </div>

      {loading && (
        <div className="text-center text-gray-400 py-16 text-sm">Loading…</div>
      )}

      {!loading && notifications.length === 0 && (
        <div className="text-center text-gray-400 py-16">
          <Bell className="w-10 h-10 mx-auto mb-3 text-gray-200" />
          <p className="text-sm">No notifications yet</p>
        </div>
      )}

      <div className="space-y-2">
        {notifications.map(n => {
          const isUnread = !n.read_at
          const isExpanded = expanded.has(n.id)
          const lines = n.body.split('\n').filter(Boolean)
          const isLong = lines.length > 3 || n.body.length > 200

          return (
            <div
              key={n.id}
              className={`rounded-xl border p-4 transition-colors ${
                isUnread ? 'bg-blue-50 border-blue-100' : 'bg-white border-gray-100'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5 shrink-0">
                  {n.channel === 'alerts'
                    ? <AlertCircle className="w-4 h-4 text-red-500" />
                    : <BookOpen className="w-4 h-4 text-blue-500" />
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-sm font-semibold text-gray-900 truncate">{n.title}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      {isUnread && <span className="w-2 h-2 rounded-full bg-blue-600" />}
                      <span className="text-xs text-gray-400">{timeAgo(n.created_at)}</span>
                    </div>
                  </div>
                  <p className={`text-sm text-gray-600 whitespace-pre-wrap ${!isExpanded && isLong ? 'line-clamp-3' : ''}`}>
                    {n.body}
                  </p>
                  {isLong && (
                    <button
                      onClick={() => toggleExpand(n.id)}
                      className="text-xs text-blue-600 hover:text-blue-800 font-semibold mt-1"
                    >
                      {isExpanded ? 'Show less' : 'Show more'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
