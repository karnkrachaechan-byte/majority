'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useDayNight } from '@/components/cosmos/useDayNight'
import { useViewport } from '@/components/cosmos/useOrbit'
import { DaySky } from '@/components/cosmos/DaySky'
import { NightSky } from '@/components/cosmos/NightSky'

export default function CreatePoll() {
  const router = useRouter()
  const day = useDayNight()
  const { w: vw, h: vh } = useViewport()

  const [step, setStep] = useState<'form' | 'verify'>('form')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [question, setQuestion] = useState('')
  const [option1, setOption1] = useState('')
  const [option2, setOption2] = useState('')
  const [age, setAge] = useState('')
  const [gender, setGender] = useState('')
  const [email, setEmail] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!question.trim() || !option1.trim() || !option2.trim()) {
      setError('Please fill in all fields.'); return
    }
    if (!age || parseInt(age) < 1 || parseInt(age) > 120) {
      setError('Please enter a valid age.'); return
    }
    if (!gender) {
      setError('Please select your gender.'); return
    }
    if (!email.includes('@')) {
      setError('Please enter a valid email.'); return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/create-poll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, option1, option2, age: parseInt(age), gender, email }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Something went wrong')
      setStep('verify')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  const serif = '"Cormorant Garamond", Georgia, "Times New Roman", serif'
  const textColor = day ? '#2a1a5e' : '#f5f0e8'
  const subColor  = day ? '#7a6a9e' : '#b0a8cc'
  const cardBg    = day ? 'rgba(255,255,255,0.75)' : 'rgba(15,12,35,0.72)'
  const borderColor = day ? 'rgba(42,26,94,0.12)' : 'rgba(245,240,232,0.12)'
  const inputBg   = day ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.06)'

  const inputStyle: React.CSSProperties = {
    width: '100%',
    border: `1px solid ${borderColor}`,
    borderRadius: 14,
    padding: '13px 16px',
    fontSize: 14,
    background: inputBg,
    color: textColor,
    outline: 'none',
    fontFamily: 'inherit',
  }

  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 12, fontWeight: 600,
    color: subColor, marginBottom: 8,
    letterSpacing: '0.05em', textTransform: 'uppercase',
  }

  if (step === 'verify') {
    return (
      <div style={{ width: '100vw', height: '100dvh', position: 'relative', overflow: 'hidden' }}>
        {day ? <DaySky w={vw} h={vh} /> : <NightSky w={vw} h={vh} />}
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          padding: 24, textAlign: 'center',
        }}>
          <div style={{
            background: cardBg, backdropFilter: 'blur(20px)',
            border: `1px solid ${borderColor}`, borderRadius: 28,
            padding: '48px 40px', maxWidth: 400, width: '100%',
          }}>
            <div style={{ fontSize: 48, marginBottom: 20 }}>📬</div>
            <h2 style={{ fontSize: 28, fontWeight: 700, color: textColor, marginBottom: 12, fontFamily: serif }}>
              Check your email
            </h2>
            <p style={{ color: subColor, lineHeight: 1.7, fontSize: 15 }}>
              We sent a magic link to{' '}
              <strong style={{ color: textColor }}>{email}</strong>.<br />
              Click it to publish your poll.
            </p>
            <button
              onClick={() => router.push('/')}
              style={{
                marginTop: 32, background: 'none', border: 'none',
                color: subColor, fontSize: 14, cursor: 'pointer',
              }}
            >
              ← Back to home
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ width: '100vw', height: '100dvh', position: 'relative', overflow: 'hidden' }}>
      {day ? <DaySky w={vw} h={vh} /> : <NightSky w={vw} h={vh} />}

      {/* Scrollable overlay */}
      <div style={{
        position: 'absolute', inset: 0, overflowY: 'auto',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: '40px 24px 60px',
      }}>
        <div style={{ width: '100%', maxWidth: 460 }}>

          <button
            onClick={() => router.push('/')}
            style={{
              background: 'none', border: 'none',
              color: subColor, fontSize: 14, cursor: 'pointer',
              marginBottom: 28, display: 'block', fontFamily: 'inherit',
            }}
          >
            ← Back
          </button>

          <div style={{
            background: cardBg, backdropFilter: 'blur(20px)',
            border: `1px solid ${borderColor}`, borderRadius: 28,
            padding: '36px 32px',
          }}>
            <h1 style={{
              fontSize: 'clamp(28px, 5vw, 38px)', fontWeight: 700,
              color: textColor, marginBottom: 6, fontFamily: serif,
              lineHeight: 1.1,
            }}>
              Ask the world
            </h1>
            <p style={{ fontSize: 14, color: subColor, marginBottom: 32 }}>
              Post a binary question — see how everyone answers.
            </p>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

              <div>
                <label style={labelStyle}>Your question</label>
                <input
                  type="text" value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="Are you a dog or cat person?"
                  style={inputStyle} maxLength={200}
                />
              </div>

              <div>
                <label style={labelStyle}>Two choices</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <input
                    type="text" value={option1}
                    onChange={(e) => setOption1(e.target.value)}
                    placeholder="Option A  (e.g. Dog)"
                    style={inputStyle} maxLength={100}
                  />
                  <input
                    type="text" value={option2}
                    onChange={(e) => setOption2(e.target.value)}
                    placeholder="Option B  (e.g. Cat)"
                    style={inputStyle} maxLength={100}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Your age</label>
                  <input
                    type="number" value={age}
                    onChange={(e) => setAge(e.target.value)}
                    placeholder="28" min={1} max={120}
                    style={inputStyle}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Gender</label>
                  <select
                    value={gender} onChange={(e) => setGender(e.target.value)}
                    style={{ ...inputStyle, background: day ? 'rgba(255,255,255,0.8)' : 'rgba(20,15,45,0.9)' }}
                  >
                    <option value="">Select</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="prefer_not_to_say">Prefer not to say</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={labelStyle}>
                  Your email{' '}
                  <span style={{ textTransform: 'none', fontWeight: 400, opacity: 0.6 }}>(for verification only)</span>
                </label>
                <input
                  type="email" value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  style={inputStyle}
                />
              </div>

              {error && (
                <p style={{ color: '#ef4444', fontSize: 13, marginTop: -8 }}>{error}</p>
              )}

              <button
                type="submit" disabled={loading}
                style={{
                  width: '100%', border: 'none', borderRadius: 100,
                  padding: '15px', fontSize: 15, fontWeight: 600,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.6 : 1,
                  background: day ? '#2a1a5e' : '#f5f0e8',
                  color: day ? '#fff' : '#1a0e3a',
                  marginTop: 4, fontFamily: 'inherit',
                  transition: 'opacity 0.2s',
                }}
              >
                {loading ? 'Sending…' : 'Send verification email →'}
              </button>

            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
