import React, { useEffect, useState } from 'react'
import axios from 'axios'

export default function Scheduler() {
  const base = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'
  const [scheduled, setScheduled] = useState<any[]>([])
  const [error, setError] = useState<string>('')
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')

  const load = () => {
    axios
      .get(`${base}/api/posts/status/SCHEDULED`, { withCredentials: true })
      .then((res) => setScheduled(res.data?.items || []))
      .catch((e) => setError(e?.message || 'Failed to load scheduled posts'))
  }

  useEffect(() => {
    load()
  }, [])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await axios.post(`${base}/api/posts`, { title, scheduledTime: date }, { withCredentials: true })
      setTitle('')
      setDate('')
      load()
    } catch (e: any) {
      setError(e?.message || 'Failed to schedule post')
    }
  }

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Scheduler</h1>
      {error && <div className="text-red-600">{error}</div>}
      <form onSubmit={submit} className="flex gap-2">
        <input
          className="border rounded px-2 py-1"
          placeholder="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <input
          className="border rounded px-2 py-1"
          type="datetime-local"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        <button className="bg-blue-600 text-white rounded px-3 py-1">Schedule</button>
      </form>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {scheduled.map((p, idx) => (
          <div key={idx} className="rounded-lg border p-4">
            <div className="font-medium">{p.title}</div>
            <div className="text-sm text-gray-600">{p.publishAt}</div>
            <div className="text-xs">status: {p.status}</div>
          </div>
        ))}
      </div>
    </div>
  )
}