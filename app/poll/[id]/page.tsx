'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { isDay, getBubbleColors, getRandomColor } from '@/lib/theme'
import FingerprintJS from '@fingerprintjs/fingerprintjs'

interface Poll {
  id: string
  question: string
  option_1: string
  option_2: string
  expires_at: string | null
}

interface DemoBreakdown {
  male: { 1: number; 2: number }
  female: { 1: number; 2: number }
  prefer_not_to_say: { 1: number; 2: number }
}

interface AgeBreakdown {
  [group: string]: { 1: number; 2: number }
}

const AGE_GROUPS = [
  { label: 'Under 18', min: 0, max: 17 },
  { label: '18–24', min: 18, max: 24 },
  { label: '25–34', min: 25, max: 34 },
  { label: '35–44', min: 35, max: 44 },
  { label: '45+', min: 45, max: 999 },
]

type Stage = 'voting' | 'demographic' | 'results'

export default function PollPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [poll, setPoll] = useState<Poll | null>(null)
  const [loading, setLoading] = useState(true)
  const [stage, setStage] = useState<Stage>('voting')
  const [selectedChoice, setSelectedChoice] = useState<1 | 2 | null>(null)
  const [voteCounts, setVoteCounts] = useState<{ 1: number; 2: number }>({ 1: 0, 2: 0 })
  const [demographics, setDemographics] = useState<DemoBreakdown | null>(null)
  const [ageBreakdown, setAgeBreakdown] = useState<AgeBreakdown | null>(null)
  const [fingerprint, setFingerprint] = useState('')
  const [canChange, setCanChange] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [zoomingChoice, setZoomingChoice] = useState<1 | 2 | null>(null)
  const [day, setDay] = useState(true)
  const [color1, setColor1] = useState('#FF6B6B')
  const [color2, setColor2] = useState('#56CCF2')
  const [copied, setCopied] = useState(false)

  // Demographic form
  const [age, setAge] = useState('')
  const [gender, setGender] = useState('')
  const [demoError, setDemoError] = useState('')
  const [demoSubmitting, setDemoSubmitting] = useState(false)

  const fetchVoteData = useCallback(async () => {
    const { data } = await supabase
      .from('votes')
      .select('choice, voter_gender, voter_age')
      .eq('poll_id', id)

    const counts = { 1: 0, 2: 0 }
    const demo: DemoBreakdown = {
      male: { 1: 0, 2: 0 },
      female: { 1: 0, 2: 0 },
      prefer_not_to_say: { 1: 0, 2: 0 },
    }
    const ageBrk: AgeBreakdown = {}
    AGE_GROUPS.forEach(g => { ageBrk[g.label] = { 1: 0, 2: 0 } })

    data?.forEach((v) => {
      if (v.choice === 1) counts[1]++
      if (v.choice === 2) counts[2]++
      if (v.voter_gender) {
        const g = v.voter_gender as keyof DemoBreakdown
        if (demo[g]) demo[g][v.choice as 1 | 2]++
      }
      if (v.voter_age) {
        const group = AGE_GROUPS.find(g => v.voter_age >= g.min && v.voter_age <= g.max)
        if (group) ageBrk[group.label][v.choice as 1 | 2]++
      }
    })

    setVoteCounts(counts)
    setDemographics(demo)
    setAgeBreakdown(ageBrk)
  }, [id])

  useEffect(() => {
    const dayMode = isDay()
    setDay(dayMode)
    document.body.className = dayMode ? 'day' : 'night'
    const colors = getBubbleColors()
    setColor1(getRandomColor(colors))
    setColor2(getRandomColor(colors))
  }, [])

  useEffect(() => {
    async function init() {
      const fp = await FingerprintJS.load()
      const result = await fp.get()
      const fpId = result.visitorId
      setFingerprint(fpId)

      const { data: pollData } = await supabase
        .from('polls').select('*').eq('id', id).single()
      setPoll(pollData)

      const res = await fetch(`/api/check-vote?poll_id=${id}&fingerprint=${fpId}`)
      const voteData = await res.json()

      if (voteData.vote) {
        setSelectedChoice(voteData.vote.choice)
        setCanChange(new Date() < new Date(voteData.vote.can_change_until))
        await fetchVoteData()
        setStage(voteData.vote.voter_age == null ? 'demographic' : 'results')
      }

      setLoading(false)
    }
    init()
  }, [id, fetchVoteData])

  async function handleVote(choice: 1 | 2) {
    if (submitting || zoomingChoice) return
    setZoomingChoice(choice)
    setTimeout(async () => {
      setSubmitting(true)
      setError('')
      try {
        const res = await fetch('/api/vote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ poll_id: id, choice, fingerprint }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Failed to vote')
        setSelectedChoice(choice)
        await fetchVoteData()
        setStage('demographic')
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to vote')
        setStage('voting')
      } finally {
        setSubmitting(false)
        setZoomingChoice(null)
      }
    }, 600)
  }

  async function handleChangeVote(choice: 1 | 2) {
    if (!canChange || submitting) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/vote', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ poll_id: id, choice, fingerprint }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setSelectedChoice(choice)
      await fetchVoteData()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to change vote')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDemoSubmit() {
    if (!age || parseInt(age) < 1 || parseInt(age) > 120) {
      setDemoError('Please enter a valid age.')
      return
    }
    if (!gender) {
      setDemoError('Please select your gender.')
      return
    }
    setDemoError('')
    setDemoSubmitting(true)
    await fetch('/api/update-demographic', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ poll_id: id, fingerprint, age: parseInt(age), gender }),
    })
    await fetchVoteData()
    setDemoSubmitting(false)
    setStage('results')
  }

  async function handleReport() {
    await fetch('/api/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ poll_id: id }),
    })
    alert('Thank you for reporting. We will review this poll.')
  }

  function handleShare() {
    const url = window.location.href
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  function voteWord(n: number) {
    return `${n} ${n === 1 ? 'vote' : 'votes'}`
  }

  const total = voteCounts[1] + voteCounts[2]
  const pct1 = total > 0 ? Math.round((voteCounts[1] / total) * 100) : 50
  const pct2 = total > 0 ? Math.round((voteCounts[2] / total) * 100) : 50

  const textColor = day ? '#111' : '#f0f0f0'
  const subColor = day ? '#666' : '#aaa'
  const cardBg = day ? 'rgba(255,255,255,0.9)' : 'rgba(30,30,30,0.9)'
  const borderColor = day ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)'

  // Demo breakdown rows
  const genderLabels: { key: keyof DemoBreakdown; label: string }[] = [
    { key: 'male', label: 'Male' },
    { key: 'female', label: 'Female' },
    { key: 'prefer_not_to_say', label: 'Prefer not to say' },
  ]

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <p style={{ color: subColor }}>Loading...</p>
    </div>
  )

  if (!poll) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: 12 }}>
      <p style={{ color: subColor }}>Poll not found.</p>
      <a href="/" style={{ color: subColor, fontSize: 14 }}>← Back</a>
    </div>
  )

  const isExpired = poll.expires_at ? new Date() > new Date(poll.expires_at) : false

  if (isExpired && stage === 'voting') return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: 12 }}>
      <p style={{ fontSize: 20, fontWeight: 700, color: textColor }}>This poll has closed</p>
      <p style={{ color: subColor, fontSize: 14 }}>{poll.question}</p>
      <a href="/" style={{ color: subColor, fontSize: 14, marginTop: 8 }}>← See other polls</a>
    </div>
  )

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', position: 'relative' }}>

      {/* Back */}
      <button onClick={() => router.push('/')} style={{
        position: 'fixed', top: 24, left: 24, zIndex: 100,
        background: 'none', border: 'none', cursor: 'pointer',
        color: subColor, fontSize: 14, fontWeight: 500,
      }}>
        ← Back
      </button>

      {/* VOTING STAGE */}
      {stage === 'voting' && (
        <div style={{
          width: '100%', height: '100%',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          gap: 32, padding: '80px 24px 40px',
        }}>
          <p className="fade-in" style={{
            fontSize: 'clamp(18px, 4vw, 28px)', fontWeight: 700,
            color: textColor, textAlign: 'center', maxWidth: 500, lineHeight: 1.4,
          }}>
            {poll.question}
          </p>
          <p style={{ fontSize: 13, color: subColor }}>
            One vote per person · changeable within 10 min
          </p>
          {error && <p style={{ color: '#ef4444', fontSize: 14 }}>{error}</p>}
          <div className="vote-row">
            {([1, 2] as const).map((choice) => {
              const isChoice1 = choice === 1
              const color = isChoice1 ? color1 : color2
              const label = isChoice1 ? poll.option_1 : poll.option_2
              return (
                <div
                  key={choice}
                  className={`vote-bubble fade-in ${zoomingChoice === choice ? 'vote-bubble-zoom' : ''}`}
                  onClick={() => handleVote(choice)}
                  style={{
                    background: color,
                    animation: zoomingChoice === choice ? undefined
                      : `float ${isChoice1 ? 5 : 6.5}s ease-in-out ${isChoice1 ? '0s' : '-2s'} infinite`,
                  }}
                >
                  <span style={{
                    color: '#fff', fontWeight: 700, fontSize: 16,
                    textShadow: '0 1px 4px rgba(0,0,0,0.2)',
                    maxWidth: '75%', display: 'block', lineHeight: 1.4, textAlign: 'center',
                  }}>
                    {label}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* DEMOGRAPHIC STAGE */}
      {stage === 'demographic' && (
        <div className="fade-in" style={{
          width: '100%', height: '100%',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px',
        }}>
          <div style={{
            background: cardBg, border: `1px solid ${borderColor}`,
            borderRadius: 24, padding: '36px 32px',
            width: '100%', maxWidth: 400, backdropFilter: 'blur(12px)',
          }}>
            <p style={{ fontSize: 18, fontWeight: 700, color: textColor, marginBottom: 8 }}>
              One quick thing
            </p>
            <p style={{ fontSize: 14, color: subColor, marginBottom: 28 }}>
              Help us show how your group voted
            </p>
            {demoError && <p style={{ color: '#ef4444', fontSize: 14, marginBottom: 16 }}>{demoError}</p>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 24 }}>
              <input
                type="number" value={age}
                onChange={(e) => setAge(e.target.value)}
                placeholder="Your age" min={1} max={120}
                style={{
                  width: '100%', border: `1px solid ${borderColor}`,
                  borderRadius: 12, padding: '12px 16px', fontSize: 14,
                  background: 'transparent', color: textColor, outline: 'none',
                }}
              />
              <select
                value={gender} onChange={(e) => setGender(e.target.value)}
                style={{
                  width: '100%', border: `1px solid ${borderColor}`,
                  borderRadius: 12, padding: '12px 16px', fontSize: 14,
                  background: day ? '#fff' : '#1e1e1e', color: textColor, outline: 'none',
                }}
              >
                <option value="">Select gender</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="prefer_not_to_say">Prefer not to say</option>
              </select>
            </div>
            <button
              onClick={handleDemoSubmit} disabled={demoSubmitting}
              style={{
                width: '100%', background: day ? '#111' : '#f0f0f0',
                color: day ? '#fff' : '#111', border: 'none', borderRadius: 100,
                padding: '14px', fontSize: 15, fontWeight: 600,
                cursor: 'pointer', opacity: demoSubmitting ? 0.6 : 1,
              }}
            >
              {demoSubmitting ? 'Loading...' : 'See results →'}
            </button>
          </div>
        </div>
      )}

      {/* RESULTS STAGE */}
      {stage === 'results' && (
        <div className="fade-in" style={{
          width: '100%', height: '100vh', overflowY: 'auto',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'flex-start',
          gap: 20, padding: '80px 24px 40px',
        }}>
          <p style={{
            fontSize: 'clamp(16px, 3.5vw, 24px)', fontWeight: 700,
            color: textColor, textAlign: 'center', maxWidth: 480,
          }}>
            {poll.question}
          </p>

          {error && <p style={{ color: '#ef4444', fontSize: 14 }}>{error}</p>}

          {/* Bubbles */}
          <div className="vote-row" style={{ gap: 24 }}>
            {([1, 2] as const).map((choice) => {
              const isChoice1 = choice === 1
              const color = isChoice1 ? color1 : color2
              const label = isChoice1 ? poll.option_1 : poll.option_2
              const pct = isChoice1 ? pct1 : pct2
              const votes = isChoice1 ? voteCounts[1] : voteCounts[2]
              const isSelected = selectedChoice === choice
              const baseSize = 180
              const size = baseSize * (0.6 + (pct / 100) * 0.8)
              return (
                <div
                  key={choice}
                  onClick={() => canChange && handleChangeVote(choice)}
                  style={{
                    animation: `float ${4 + (choice * 1.5)}s ease-in-out ${choice === 1 ? '0s' : '-2s'} infinite`,
                    width: size, height: size, borderRadius: '50%', background: color,
                    display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center',
                    cursor: canChange ? 'pointer' : 'default',
                    transition: 'width 0.8s ease, height 0.8s ease',
                    boxShadow: isSelected ? `0 0 0 4px ${color}40, 0 12px 40px ${color}50` : 'none',
                    padding: 16, textAlign: 'center', flexShrink: 0,
                  }}
                >
                  <span style={{
                    color: '#fff', fontWeight: 700, fontSize: size > 150 ? 15 : 13,
                    textShadow: '0 1px 4px rgba(0,0,0,0.2)',
                    lineHeight: 1.3, display: 'block', maxWidth: size * 0.7,
                  }}>
                    {isSelected && '✓ '}{label}
                  </span>
                  <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: size > 150 ? 22 : 16, fontWeight: 800, marginTop: 6 }}>
                    {pct}%
                  </span>
                  <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, marginTop: 2 }}>
                    {voteWord(votes)}
                  </span>
                </div>
              )
            })}
          </div>

          <p style={{ fontSize: 13, color: subColor }}>{voteWord(total)} total</p>

          {canChange && (
            <p style={{ fontSize: 13, color: subColor }}>Tap the other bubble to change your vote</p>
          )}

          {/* Demographic breakdown */}
          {demographics && total > 0 && (
            <div style={{
              width: '100%', maxWidth: 380,
              background: cardBg, border: `1px solid ${borderColor}`,
              borderRadius: 20, padding: '20px 24px',
              backdropFilter: 'blur(12px)',
            }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: subColor, marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                By gender
              </p>
              {genderLabels.map(({ key, label }) => {
                const g = demographics[key]
                const gTotal = g[1] + g[2]
                if (gTotal === 0) return null
                const gPct1 = Math.round((g[1] / gTotal) * 100)
                const gPct2 = 100 - gPct1
                return (
                  <div key={key} style={{ marginBottom: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                      <span style={{ fontSize: 13, color: textColor, fontWeight: 500 }}>{label}</span>
                      <span style={{ fontSize: 12, color: subColor }}>{voteWord(gTotal)}</span>
                    </div>
                    <div style={{ display: 'flex', height: 8, borderRadius: 100, overflow: 'hidden', gap: 2 }}>
                      <div style={{ width: `${gPct1}%`, background: color1, borderRadius: 100, transition: 'width 0.8s ease' }} />
                      <div style={{ width: `${gPct2}%`, background: color2, borderRadius: 100, transition: 'width 0.8s ease' }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                      <span style={{ fontSize: 11, color: subColor }}>{poll.option_1} {gPct1}%</span>
                      <span style={{ fontSize: 11, color: subColor }}>{gPct2}% {poll.option_2}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Age breakdown */}
          {ageBreakdown && total > 0 && AGE_GROUPS.some(g => ageBreakdown[g.label][1] + ageBreakdown[g.label][2] > 0) && (
            <div style={{
              width: '100%', maxWidth: 380,
              background: cardBg, border: `1px solid ${borderColor}`,
              borderRadius: 20, padding: '20px 24px',
              backdropFilter: 'blur(12px)',
            }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: subColor, marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                By age
              </p>
              {AGE_GROUPS.map(({ label }) => {
                const g = ageBreakdown[label]
                const gTotal = g[1] + g[2]
                if (gTotal === 0) return null
                const gPct1 = Math.round((g[1] / gTotal) * 100)
                const gPct2 = 100 - gPct1
                return (
                  <div key={label} style={{ marginBottom: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                      <span style={{ fontSize: 13, color: textColor, fontWeight: 500 }}>{label}</span>
                      <span style={{ fontSize: 12, color: subColor }}>{voteWord(gTotal)}</span>
                    </div>
                    <div style={{ display: 'flex', height: 8, borderRadius: 100, overflow: 'hidden', gap: 2 }}>
                      <div style={{ width: `${gPct1}%`, background: color1, borderRadius: 100, transition: 'width 0.8s ease' }} />
                      <div style={{ width: `${gPct2}%`, background: color2, borderRadius: 100, transition: 'width 0.8s ease' }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                      <span style={{ fontSize: 11, color: subColor }}>{poll.option_1} {gPct1}%</span>
                      <span style={{ fontSize: 11, color: subColor }}>{gPct2}% {poll.option_2}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Share button */}
          <button
            onClick={handleShare}
            style={{
              background: day ? '#111' : '#f0f0f0',
              color: day ? '#fff' : '#111',
              border: 'none', borderRadius: 100,
              padding: '12px 28px', fontSize: 14, fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {copied ? '✓ Copied!' : 'Share this poll'}
          </button>

          <button
            onClick={handleReport}
            style={{
              background: 'none', border: 'none',
              color: subColor, fontSize: 12,
              cursor: 'pointer', opacity: 0.5,
            }}
          >
            Report this poll
          </button>
        </div>
      )}
    </div>
  )
}
