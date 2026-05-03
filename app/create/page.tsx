'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { isDay } from '@/lib/theme'

export default function CreatePoll() {
  const router = useRouter()
  const [step, setStep] = useState<'form' | 'verify'>('form')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [day, setDay] = useState(true)

  const [question, setQuestion] = useState('')
  const [option1, setOption1] = useState('')
  const [option2, setOption2] = useState('')
  const [age, setAge] = useState('')
  const [gender, setGender] = useState('')
  const [email, setEmail] = useState('')

  useEffect(() => {
    const dayMode = isDay()
    setDay(dayMode)
    document.body.className = dayMode ? 'day' : 'night'
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (!question.trim() || !option1.trim() || !option2.trim()) {
      setError('Please fill in all fields.')
      return
    }
    if (!age || parseInt(age) < 1 || parseInt(age) > 120) {
      setError('Please enter a valid age.')
      return
    }
    if (!gender) {
      setError('Please select your gender.')
      return
    }
    if (!email.includes('@')) {
      setError('Please enter a valid email.')
      return
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

  const textColor = day ? '#111' : '#f0f0f0'
  const subColor = day ? '#666' : '#aaa'
  const borderColor = day ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.12)'
  const inputBg = day ? '#fff' : '#1a1a1a'

  const inputStyle = {
    width: '100%',
    border: `1px solid ${borderColor}`,
    borderRadius: 12,
    padding: '12px 16px',
    fontSize: 14,
    background: inputBg,
    color: textColor,
    outline: 'none',
  }

  if (step === 'verify') {
    return (
      <div style={{
        width: '100vw', height: '100vh',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: 24, textAlign: 'center',
      }}>
        <div style={{ fontSize: 48, marginBottom: 24 }}>📬</div>
        <h2 style={{ fontSize: 24, fontWeight: 700, color: textColor, marginBottom: 12 }}>
          Check your email
        </h2>
        <p style={{ color: subColor, lineHeight: 1.6 }}>
          We sent a magic link to <strong style={{ color: textColor }}>{email}</strong>.<br />
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
    )
  }

  return (
    <div style={{
      width: '100vw', minHeight: '100vh',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24, overflowY: 'auto',
    }}>
      <div style={{ width: '100%', maxWidth: 420 }}>
        <button
          onClick={() => router.push('/')}
          style={{
            background: 'none', border: 'none',
            color: subColor, fontSize: 14, cursor: 'pointer',
            marginBottom: 32, display: 'block',
          }}
        >
          ← Back
        </button>

        <h1 style={{ fontSize: 26, fontWeight: 700, color: textColor, marginBottom: 32 }}>
          Create a Poll
        </h1>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: subColor, marginBottom: 8 }}>
              Your question
            </label>
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Are you a dog or cat person?"
              style={inputStyle}
              maxLength={200}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: subColor, marginBottom: 8 }}>
              Options
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <input
                type="text"
                value={option1}
                onChange={(e) => setOption1(e.target.value)}
                placeholder="Option 1 (e.g. Dog)"
                style={inputStyle}
                maxLength={100}
              />
              <input
                type="text"
                value={option2}
                onChange={(e) => setOption2(e.target.value)}
                placeholder="Option 2 (e.g. Cat)"
                style={inputStyle}
                maxLength={100}
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: subColor, marginBottom: 8 }}>
              Your age
            </label>
            <input
              type="number"
              value={age}
              onChange={(e) => setAge(e.target.value)}
              placeholder="e.g. 28"
              min={1} max={120}
              style={inputStyle}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: subColor, marginBottom: 8 }}>
              Your gender
            </label>
            <select
              value={gender}
              onChange={(e) => setGender(e.target.value)}
              style={inputStyle}
            >
              <option value="">Select gender</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="prefer_not_to_say">Prefer not to say</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: subColor, marginBottom: 8 }}>
              Your email <span style={{ fontWeight: 400, opacity: 0.6 }}>(for verification only)</span>
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              style={inputStyle}
            />
          </div>

          {error && <p style={{ color: '#ef4444', fontSize: 14 }}>{error}</p>}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              background: day ? '#111' : '#f0f0f0',
              color: day ? '#fff' : '#111',
              border: 'none', borderRadius: 100,
              padding: '14px', fontSize: 15, fontWeight: 600,
              cursor: 'pointer', opacity: loading ? 0.6 : 1,
              marginTop: 8,
            }}
          >
            {loading ? 'Sending...' : 'Send verification email'}
          </button>
        </form>
      </div>
    </div>
  )
}
