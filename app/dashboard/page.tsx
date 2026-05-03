'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { isDay } from '@/lib/theme'

interface Poll {
  id: string
  question: string
  option_1: string
  option_2: string
  is_active: boolean
  created_at: string
  expires_at: string | null
  voteCount: number
}

function DashboardContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const email = searchParams.get('email') ?? ''
  const token = searchParams.get('token') ?? ''

  const [polls, setPolls] = useState<Poll[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [day, setDay] = useState(true)
  const [deleting, setDeleting] = useState<string | null>(null)

  useEffect(() => {
    const d = isDay()
    setDay(d)
    document.body.className = d ? 'day' : 'night'
  }, [])

  useEffect(() => {
    if (!email || !token) { setError('Invalid link'); setLoading(false); return }
    fetch(`/api/my-polls?email=${encodeURIComponent(email)}&token=${token}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { setError(data.error); return }
        setPolls(data.polls)
      })
      .finally(() => setLoading(false))
  }, [email, token])

  async function handleDelete(pollId: string) {
    if (!confirm('Delete this poll and all its votes?')) return
    setDeleting(pollId)
    await fetch(`/api/my-polls?email=${encodeURIComponent(email)}&token=${token}&poll_id=${pollId}`, { method: 'DELETE' })
    setPolls(p => p.filter(x => x.id !== pollId))
    setDeleting(null)
  }

  const textColor = day ? '#111' : '#f0f0f0'
  const subColor = day ? '#666' : '#aaa'
  const cardBg = day ? '#fff' : '#1a1a1a'
  const borderColor = day ? '#e5e5e5' : '#2a2a2a'

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <p style={{ color: subColor }}>Loading...</p>
    </div>
  )

  if (error) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: 12 }}>
      <p style={{ color: '#ef4444', fontSize: 16 }}>{error}</p>
      <a href="/dashboard/request" style={{ color: subColor, fontSize: 14 }}>Request a new link</a>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', padding: '40px 24px', maxWidth: 600, margin: '0 auto' }}>
      <button onClick={() => router.push('/')} style={{
        background: 'none', border: 'none', color: subColor,
        fontSize: 14, cursor: 'pointer', marginBottom: 32, padding: 0,
      }}>
        ← Back
      </button>
      <h1 style={{ fontSize: 26, fontWeight: 700, color: textColor, marginBottom: 4 }}>My Polls</h1>
      <p style={{ fontSize: 14, color: subColor, marginBottom: 32 }}>{email}</p>

      {polls.length === 0 ? (
        <p style={{ color: subColor }}>No polls yet.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {polls.map(poll => {
            const expired = poll.expires_at ? new Date() > new Date(poll.expires_at) : false
            const expiresDate = poll.expires_at ? new Date(poll.expires_at).toLocaleDateString() : '—'
            return (
              <div key={poll.id} style={{
                background: cardBg, border: `1px solid ${borderColor}`,
                borderRadius: 16, padding: '20px 24px',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 15, fontWeight: 600, color: textColor, marginBottom: 6 }}>{poll.question}</p>
                    <p style={{ fontSize: 13, color: subColor }}>{poll.option_1} vs {poll.option_2}</p>
                  </div>
                  <span style={{
                    fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 100,
                    background: expired ? '#fef2f2' : poll.is_active ? '#f0fdf4' : '#fefce8',
                    color: expired ? '#dc2626' : poll.is_active ? '#16a34a' : '#ca8a04',
                  }}>
                    {expired ? 'Expired' : poll.is_active ? 'Active' : 'Pending'}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
                  <div style={{ display: 'flex', gap: 20 }}>
                    <span style={{ fontSize: 13, color: subColor }}>
                      {poll.voteCount} {poll.voteCount === 1 ? 'vote' : 'votes'}
                    </span>
                    <span style={{ fontSize: 13, color: subColor }}>
                      Expires {expiresDate}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 12 }}>
                    {poll.is_active && (
                      <button onClick={() => router.push(`/poll/${poll.id}`)} style={{
                        background: 'none', border: `1px solid ${borderColor}`,
                        borderRadius: 100, padding: '6px 16px',
                        fontSize: 13, color: textColor, cursor: 'pointer',
                      }}>
                        View
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(poll.id)}
                      disabled={deleting === poll.id}
                      style={{
                        background: 'none', border: '1px solid #fca5a5',
                        borderRadius: 100, padding: '6px 16px',
                        fontSize: 13, color: '#ef4444', cursor: 'pointer',
                        opacity: deleting === poll.id ? 0.5 : 1,
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function DashboardPage() {
  return (
    <Suspense>
      <DashboardContent />
    </Suspense>
  )
}
