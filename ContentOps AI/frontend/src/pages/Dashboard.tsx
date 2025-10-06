import React, { useEffect, useState } from 'react'
import axios from 'axios'

export default function Dashboard() {
  const [stats, setStats] = useState<any>(null)
  const [error, setError] = useState<string>('')
  const base = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'

  useEffect(() => {
    axios
      .get(`${base}/api/dashboard/quick-stats`, { withCredentials: true })
      .then((res) => setStats(res.data))
      .catch((e) => setError(e?.message || 'Failed to load dashboard'))
  }, [])

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      {error && <div className="text-red-600">{error}</div>}
      {!stats ? (
        <div>Loading...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-lg border p-4">
            <div className="text-sm text-gray-500">Total Posts</div>
            <div className="text-3xl font-bold">{stats.totalPosts ?? 0}</div>
          </div>
          <div className="rounded-lg border p-4">
            <div className="text-sm text-gray-500">Scheduled Posts</div>
            <div className="text-3xl font-bold">{stats.scheduledPosts ?? 0}</div>
          </div>
          <div className="rounded-lg border p-4">
            <div className="text-sm text-gray-500">Engagement</div>
            <div className="text-3xl font-bold">{stats.engagementSummary ?? 0}</div>
          </div>
        </div>
      )}
    </div>
  )
}