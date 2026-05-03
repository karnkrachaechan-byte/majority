'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { isDay } from '@/lib/theme'

export default function RequestDashboard() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [day, setDay] = useState(true)

  useEffect(() => {
    const d = isDay()
    setDay(d)
    document.body.className = d ? 'day' : 'night'
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const res = await fetch('/api/dashboard-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    const data = await res.json()
    setLoading(false)
    if (!res.ok) { setError(data.error || 'Something went wrong'); return }
    setSent(true)
  }

  const textColor = day ? '#111' : '#f0f0f0'
  const subColor = day ? '#666' : '#aaa'
  const borderColor = day ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.12)'

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 380 }}>
        <button onClick={() => router.push('/')} style={{
          background: 'none', border: 'none', color: subColor,
          fontSize: 14, cursor: 'pointer', marginBottom: 32, padding: 0,
        }}>
          ← Back
        </button>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: textColor, marginBottom: 8 }}>My polls</h1>
        <p style={{ fontSize: 14, color: subColor, marginBottom: 28 }}>
          Enter your email and we'll send you a link to manage your polls.
        </p>
        {sent ? (
          <p style={{ fontSize: 15, color: textColor }}>
            Check your inbox — link sent to <strong>{email}</strong>
          </p>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {error && <p style={{ color: '#ef4444', fontSize: 14 }}>{error}</p>}
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="your@email.com" required
              style={{
                width: '100%', border: `1px solid ${borderColor}`,
                borderRadius: 12, padding: '12px 16px', fontSize: 14,
                background: 'transparent', color: textColor, outline: 'none',
              }}
            />
            <button type="submit" disabled={loading} style={{
              background: day ? '#111' : '#f0f0f0',
              color: day ? '#fff' : '#111',
              border: 'none', borderRadius: 100, padding: '14px',
              fontSize: 15, fontWeight: 600, cursor: 'pointer',
              opacity: loading ? 0.6 : 1,
            }}>
              {loading ? 'Sending...' : 'Send me the link'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
