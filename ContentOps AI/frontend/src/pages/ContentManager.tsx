import React, { useEffect, useState } from 'react'
import axios from 'axios'

export default function ContentManager() {
  const [items, setItems] = useState<any[]>([])
  const [error, setError] = useState<string>('')
  const base = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'

  useEffect(() => {
    axios
      .get(`${base}/api/content`, { withCredentials: true })
      .then((res) => setItems(res.data?.items || []))
      .catch((e) => setError(e?.message || 'Failed to load content'))
  }, [])

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Content Manager</h1>
      {error && <div className="text-red-600">{error}</div>}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {items.map((item, idx) => (
          <div key={idx} className="rounded-lg border p-4">
            <div className="font-medium">{item.title || 'Untitled'}</div>
            <div className="text-sm text-gray-600">{item.summary || ''}</div>
          </div>
        ))}
      </div>
    </div>
  )
}