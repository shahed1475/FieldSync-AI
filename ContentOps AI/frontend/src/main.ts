import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate, Link } from 'react-router-dom'
import './style.css'

import Dashboard from './pages/Dashboard'
import ContentManager from './pages/ContentManager'
import Scheduler from './pages/Scheduler'
import Analytics from './pages/Analytics'

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-50 text-gray-900">
        <header className="border-b bg-white">
          <div className="mx-auto max-w-6xl p-4 flex gap-6 items-center">
            <Link to="/" className="font-semibold">ContentOps AI</Link>
            <nav className="flex gap-4">
              <Link to="/dashboard">Dashboard</Link>
              <Link to="/content">Content</Link>
              <Link to="/scheduler">Scheduler</Link>
              <Link to="/analytics">Analytics</Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-6xl p-6">
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/content" element={<ContentManager />} />
            <Route path="/scheduler" element={<Scheduler />} />
            <Route path="/analytics" element={<Analytics />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}

const rootEl = document.getElementById('app')!
createRoot(rootEl).render(<App />)
