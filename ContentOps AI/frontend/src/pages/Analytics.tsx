import React, { useEffect, useState } from 'react'

export default function Analytics() {
  const base = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'
  const [events, setEvents] = useState<string[]>([])

  useEffect(() => {
    // Optionally include token if available in localStorage
    const token = localStorage.getItem('accessToken')
    const url = token ? `${base}/api/events/subscribe?token=${encodeURIComponent(token)}` : `${base}/api/events/subscribe`
    const es = new EventSource(url)
    es.onmessage = (ev) => setEvents((prev) => [...prev, ev.data])
    es.onerror = () => {
      es.close()
    }
    return () => es.close()
  }, [])

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Analytics</h1>
      <div className="rounded-lg border p-4">
        <div className="font-medium mb-2">Real-time events</div>
        <div className="space-y-1">
          {events.length === 0 ? (
            <div className="text-sm text-gray-500">Waiting for events...</div>
          ) : (
            events.map((e, idx) => (
              <div key={idx} className="text-sm font-mono break-words">
                {e}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}