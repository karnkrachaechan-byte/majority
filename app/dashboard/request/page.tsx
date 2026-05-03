'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useDayNight } from '@/components/cosmos/useDayNight'
import { useViewport } from '@/components/cosmos/useOrbit'
import { DaySky } from '@/components/cosmos/DaySky'
import { NightSky } from '@/components/cosmos/NightSky'

export default function RequestDashboard() {
  const router = useRouter()
  const day = useDayNight()
  const { w: vw, h: vh } = useViewport()

  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

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

  const serif = '"Cormorant Garamond", Georgia, "Times New Roman", serif'
  const textColor   = day ? '#2a1a5e' : '#f5f0e8'
  const subColor    = day ? '#7a6a9e' : '#b0a8cc'
  const cardBg      = day ? 'rgba(255,255,255,0.75)' : 'rgba(15,12,35,0.72)'
  const borderColor = day ? 'rgba(42,26,94,0.12)' : 'rgba(245,240,232,0.12)'
  const inputBg     = day ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.06)'

  return (
    <div style={{ width: '100vw', height: '100dvh', position: 'relative', overflow: 'hidden' }}>
      {day ? <DaySky w={vw} h={vh} /> : <NightSky w={vw} h={vh} />}

      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}>
        <div style={{ width: '100%', maxWidth: 420 }}>

          <button
            onClick={() => router.push('/')}
            style={{
              background: 'none', border: 'none', color: subColor,
              fontSize: 14, cursor: 'pointer', marginBottom: 28,
              display: 'block', fontFamily: 'inherit', padding: 0,
            }}
          >
            ← Back
          </button>

          <div style={{
            background: cardBg, backdropFilter: 'blur(20px)',
            border: `1px solid ${borderColor}`, borderRadius: 28,
            padding: '40px 36px',
          }}>

            {sent ? (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 44, marginBottom: 20 }}>📬</div>
                <h2 style={{ fontSize: 28, fontWeight: 700, color: textColor, marginBottom: 10, fontFamily: serif }}>
                  Check your inbox
                </h2>
                <p style={{ fontSize: 14, color: subColor, lineHeight: 1.7 }}>
                  We sent a link to <strong style={{ color: textColor }}>{email}</strong>.<br />
                  Click it to manage your polls.
                </p>
                <button
                  onClick={() => router.push('/')}
                  style={{
                    marginTop: 28, background: 'none', border: 'none',
                    color: subColor, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  ← Back to home
                </button>
              </div>
            ) : (
              <>
                <h1 style={{
                  fontSize: 'clamp(26px, 4vw, 34px)', fontWeight: 700,
                  color: textColor, marginBottom: 8, fontFamily: serif, lineHeight: 1.1,
                }}>
                  My polls
                </h1>
                <p style={{ fontSize: 14, color: subColor, marginBottom: 28, lineHeight: 1.6 }}>
                  Enter your email and we'll send you a link to manage your polls.
                </p>

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {error && <p style={{ color: '#ef4444', fontSize: 13 }}>{error}</p>}
                  <input
                    type="email" value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="your@email.com" required
                    style={{
                      width: '100%', border: `1px solid ${borderColor}`,
                      borderRadius: 14, padding: '13px 16px', fontSize: 14,
                      background: inputBg, color: textColor, outline: 'none',
                      fontFamily: 'inherit',
                    }}
                  />
                  <button
                    type="submit" disabled={loading}
                    style={{
                      width: '100%', border: 'none', borderRadius: 100,
                      padding: '15px', fontSize: 15, fontWeight: 600,
                      cursor: loading ? 'not-allowed' : 'pointer',
                      opacity: loading ? 0.6 : 1,
                      background: day ? '#2a1a5e' : '#f5f0e8',
                      color: day ? '#fff' : '#1a0e3a',
                      fontFamily: 'inherit', transition: 'opacity 0.2s',
                    }}
                  >
                    {loading ? 'Sending…' : 'Send me the link →'}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
