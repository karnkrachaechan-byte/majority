'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import FingerprintJS from '@fingerprintjs/fingerprintjs'
import { useDayNight } from '@/components/cosmos/useDayNight'
import { useViewport } from '@/components/cosmos/useOrbit'
import { DaySky } from '@/components/cosmos/DaySky'
import { NightSky } from '@/components/cosmos/NightSky'

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
  const day = useDayNight()
  const { w: vw, h: vh } = useViewport()

  const emailParam = searchParams.get('email') ?? ''
  const tokenParam = searchParams.get('token') ?? ''

  const [fingerprint, setFingerprint] = useState('')
  const [polls, setPolls] = useState<Poll[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [archiving, setArchiving] = useState<string | null>(null)
  const [confirmPoll, setConfirmPoll] = useState<Poll | null>(null)
  const [requestSent, setRequestSent] = useState<string | null>(null)

  const serif = '"Cormorant Garamond", Georgia, "Times New Roman", serif'
  const textColor   = day ? '#2a1a5e' : '#f5f0e8'
  const subColor    = day ? '#7a6a9e' : '#b0a8cc'
  const cardBg      = day ? 'rgba(255,255,255,0.75)' : 'rgba(15,12,35,0.72)'
  const borderColor = day ? 'rgba(42,26,94,0.12)' : 'rgba(245,240,232,0.12)'
  const itemBg      = day ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.05)'

  useEffect(() => {
    async function load() {
      let url = ''

      // Email magic link flow (coming from email)
      if (emailParam && tokenParam) {
        url = `/api/my-polls?email=${encodeURIComponent(emailParam)}&token=${tokenParam}`
      } else {
        // Fingerprint flow (default)
        const fp = await FingerprintJS.load()
        const result = await fp.get()
        const fpId = result.visitorId
        setFingerprint(fpId)
        url = `/api/my-polls?fingerprint=${fpId}`
      }

      const res = await fetch(url)
      const data = await res.json()
      if (data.error) { setError(data.error) }
      else { setPolls(data.polls) }
      setLoading(false)
    }
    load()
  }, [emailParam, tokenParam])

  async function handleArchive(poll: Poll) {
    if (poll.voteCount >= 100) {
      // Request archive via email
      setArchiving(poll.id)
      await fetch('/api/request-archive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ poll_id: poll.id, fingerprint }),
      })
      setRequestSent(poll.id)
      setArchiving(null)
    } else {
      setConfirmPoll(poll)
    }
  }

  async function confirmArchive() {
    if (!confirmPoll) return
    setArchiving(confirmPoll.id)
    setConfirmPoll(null)
    const params = fingerprint
      ? `fingerprint=${fingerprint}&poll_id=${confirmPoll.id}`
      : `email=${encodeURIComponent(emailParam)}&token=${tokenParam}&poll_id=${confirmPoll.id}`
    await fetch(`/api/my-polls?${params}`, { method: 'DELETE' })
    setPolls(p => p.filter(x => x.id !== confirmPoll.id))
    setArchiving(null)
  }

  return (
    <div style={{ width: '100vw', height: '100dvh', position: 'relative', overflow: 'hidden' }}>
      {day ? <DaySky w={vw} h={vh} /> : <NightSky w={vw} h={vh} />}

      <div style={{
        position: 'absolute', inset: 0, overflowY: 'auto',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: '40px 24px 60px',
      }}>
        <div style={{ width: '100%', maxWidth: 520 }}>

          <button onClick={() => router.push('/')} style={{
            background: 'none', border: 'none', color: subColor,
            fontSize: 14, cursor: 'pointer', marginBottom: 28,
            display: 'block', fontFamily: 'inherit', padding: 0,
          }}>
            ← Back
          </button>

          <div style={{
            background: cardBg, backdropFilter: 'blur(20px)',
            border: `1px solid ${borderColor}`, borderRadius: 28,
            padding: '36px 32px',
          }}>
            <h1 style={{
              fontSize: 'clamp(26px, 4vw, 34px)', fontWeight: 700,
              color: textColor, marginBottom: 6, fontFamily: serif, lineHeight: 1.1,
            }}>
              My polls
            </h1>
            <p style={{ fontSize: 14, color: subColor, marginBottom: 28 }}>
              Polls you created on this browser
            </p>

            {loading ? (
              <p style={{ color: subColor, fontSize: 14 }}>Loading…</p>
            ) : error ? (
              <p style={{ color: '#ef4444', fontSize: 14 }}>{error}</p>
            ) : polls.length === 0 ? (
              <p style={{ color: subColor, fontSize: 14 }}>No polls found on this browser.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {polls.map(poll => {
                  const expired = false
                  const createdDate = poll.created_at ? new Date(poll.created_at).toLocaleDateString() : '—'
                  return (
                    <div key={poll.id} style={{
                      background: itemBg, border: `1px solid ${borderColor}`,
                      borderRadius: 18, padding: '18px 20px',
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                        <div style={{ flex: 1 }}>
                          <p style={{ fontSize: 15, fontWeight: 600, color: textColor, marginBottom: 4 }}>{poll.question}</p>
                          <p style={{ fontSize: 13, color: subColor }}>{poll.option_1} vs {poll.option_2}</p>
                        </div>
                        <span style={{
                          fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 100, whiteSpace: 'nowrap',
                          background: expired ? 'rgba(239,68,68,0.12)' : poll.is_active ? 'rgba(34,197,94,0.12)' : 'rgba(234,179,8,0.12)',
                          color: expired ? '#ef4444' : poll.is_active ? '#16a34a' : '#ca8a04',
                        }}>
                          {expired ? 'Expired' : poll.is_active ? 'Active' : 'Pending'}
                        </span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14 }}>
                        <div style={{ display: 'flex', gap: 16 }}>
                          <span style={{ fontSize: 13, color: subColor }}>{poll.voteCount} {poll.voteCount === 1 ? 'vote' : 'votes'}</span>
                          <span style={{ fontSize: 13, color: subColor }}>Created {createdDate}</span>
                        </div>
                        <div style={{ display: 'flex', gap: 10 }}>
                          {poll.is_active && (
                            <button onClick={() => router.push(`/poll/${poll.id}`)} style={{
                              background: 'none', border: `1px solid ${borderColor}`,
                              borderRadius: 100, padding: '6px 16px',
                              fontSize: 13, color: textColor, cursor: 'pointer', fontFamily: 'inherit',
                            }}>View</button>
                          )}
                          {requestSent === poll.id ? (
                            <span style={{ fontSize: 12, color: subColor }}>Request sent ✓</span>
                          ) : (
                            <button
                              onClick={() => handleArchive(poll)}
                              disabled={archiving === poll.id}
                              style={{
                                background: 'none',
                                border: `1px solid ${poll.voteCount >= 100 ? 'rgba(99,102,241,0.4)' : 'rgba(239,68,68,0.3)'}`,
                                borderRadius: 100, padding: '6px 16px',
                                fontSize: 13,
                                color: poll.voteCount >= 100 ? '#6366f1' : '#ef4444',
                                cursor: 'pointer',
                                opacity: archiving === poll.id ? 0.5 : 1,
                                fontFamily: 'inherit',
                              }}
                            >
                              {poll.voteCount >= 100 ? 'Request Archive' : 'Archive'}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Email fallback */}
            {!emailParam && !loading && (
              <div style={{ marginTop: 28, paddingTop: 24, borderTop: `1px solid ${borderColor}`, textAlign: 'center' }}>
                <p style={{ fontSize: 13, color: subColor }}>
                  Don&apos;t see your poll?{' '}
                  <a href="/dashboard/request" style={{ color: textColor, fontWeight: 600, textDecoration: 'none' }}>
                    Try with email →
                  </a>
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Archive confirmation popup */}
      {confirmPoll && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 200,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
          background: day ? 'rgba(214,210,235,0.5)' : 'rgba(10,14,31,0.6)',
          backdropFilter: 'blur(10px)',
        }}>
          <div style={{
            background: day ? 'rgba(255,255,255,0.88)' : 'rgba(15,12,35,0.88)',
            border: `1px solid ${borderColor}`, borderRadius: 28,
            padding: '36px 32px', maxWidth: 380, width: '100%',
            textAlign: 'center', backdropFilter: 'blur(20px)',
          }}>
            <p style={{
              fontSize: 22, fontWeight: 700, color: textColor, marginBottom: 10,
              fontFamily: serif,
            }}>
              Ready to close this one?
            </p>
            <p style={{ fontSize: 14, color: subColor, lineHeight: 1.7, marginBottom: 8 }}>
              This poll will go offline and vanish from your view — but every vote cast here is still counted and kept safe.
            </p>
            <p style={{ fontSize: 13, color: subColor, marginBottom: 28, fontStyle: 'italic' }}>
              &ldquo;{confirmPoll.question}&rdquo;
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button
                onClick={confirmArchive}
                style={{
                  width: '100%', border: 'none', borderRadius: 100,
                  padding: '14px', fontSize: 15, fontWeight: 600, cursor: 'pointer',
                  background: day ? '#2a1a5e' : '#f5f0e8',
                  color: day ? '#fff' : '#1a0e3a', fontFamily: 'inherit',
                }}
              >
                Yes, archive it
              </button>
              <button
                onClick={() => setConfirmPoll(null)}
                style={{
                  width: '100%', border: 'none', borderRadius: 100,
                  padding: '14px', fontSize: 15, fontWeight: 500,
                  cursor: 'pointer', background: 'transparent',
                  color: subColor, fontFamily: 'inherit',
                }}
              >
                Cancel
              </button>
            </div>
          </div>
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
