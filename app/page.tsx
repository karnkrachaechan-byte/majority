'use client'

import { useEffect, useState, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import FingerprintJS from '@fingerprintjs/fingerprintjs'
import { supabase } from '@/lib/supabase'
import { assignPalette } from '@/lib/theme'
import { useDayNight, setDayNightOverride } from '@/components/cosmos/useDayNight'
import { useViewport } from '@/components/cosmos/useOrbit'
import { getChannel, CHANNELS } from '@/lib/channels'
import { t } from '@/lib/i18n'
import { DemographicRings } from '@/components/cosmos/DemographicRings'

interface PollData {
  id: string
  question: string
  option_1: string
  option_2: string
  voteCount: number
  totals: { a: number; b: number; total: number }
  created_at: string
}

interface Breakdown {
  gender: { male: { 1: number; 2: number }; female: { 1: number; 2: number }; prefer_not_to_say: { 1: number; 2: number } }
  age: Record<string, { 1: number; 2: number }>
}

const AGE_GROUPS = [
  { label: 'Under 18', min: 0, max: 17 },
  { label: '18–24', min: 18, max: 24 },
  { label: '25–34', min: 25, max: 34 },
  { label: '35–44', min: 35, max: 44 },
  { label: '45+', min: 45, max: 999 },
]

async function fetchBreakdown(pollId: string): Promise<Breakdown> {
  const { data } = await supabase
    .from('votes').select('choice, voter_gender, voter_age').eq('poll_id', pollId)
  const gender: Breakdown['gender'] = {
    male: { 1: 0, 2: 0 },
    female: { 1: 0, 2: 0 },
    prefer_not_to_say: { 1: 0, 2: 0 },
  }
  const age: Breakdown['age'] = {}
  AGE_GROUPS.forEach(g => { age[g.label] = { 1: 0, 2: 0 } })
  data?.forEach(v => {
    const c = v.choice as 1 | 2
    const g = v.voter_gender as keyof Breakdown['gender'] | null
    if (g && gender[g]) gender[g][c]++
    if (v.voter_age != null) {
      const group = AGE_GROUPS.find(x => v.voter_age >= x.min && v.voter_age <= x.max)
      if (group) age[group.label][c]++
    }
  })
  return { gender, age }
}

type ModalPhase = 'expanding' | 'choosing' | 'demographic' | 'result'
interface ModalState {
  poll: PollData
  colorA: string
  colorB: string
  phase: ModalPhase
  voted?: 1 | 2
  totals?: { a: number; b: number; total: number }
  voteId?: string
  breakdown?: Breakdown
}

function formatVotes(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

const MIN_GAP = 24
const ASK_R = 54

function mixHex(a: string, b: string): string {
  const p = (s: string) => parseInt(s.replace('#', ''), 16)
  const n1 = p(a), n2 = p(b)
  const r = Math.round(((n1 >> 16) & 255) * 0.5 + ((n2 >> 16) & 255) * 0.5)
  const g = Math.round(((n1 >> 8) & 255) * 0.5 + ((n2 >> 8) & 255) * 0.5)
  const bl = Math.round((n1 & 255) * 0.5 + (n2 & 255) * 0.5)
  return `rgb(${r},${g},${bl})`
}

function det(id: string, salt: number): number {
  let h = 2166136261 ^ salt
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619) }
  return ((h >>> 0) % 10000) / 10000
}

export default function Home() {
  const router = useRouter()
  const day = useDayNight()
  const { w: vw, h: vh } = useViewport()
  const [polls, setPolls] = useState<PollData[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<ModalState | null>(null)
  const [countdown, setCountdown] = useState(0)
  const [demoAge, setDemoAge] = useState('')
  const [demoGender, setDemoGender] = useState('')
  const [demoError, setDemoError] = useState('')
  const [demoSubmitting, setDemoSubmitting] = useState(false)
  const [channel, setChannel] = useState<string | null>(null)
  const [showChannelDropdown, setShowChannelDropdown] = useState(false)
  const [fingerprint, setFingerprint] = useState('')
  const [shareCopied, setShareCopied] = useState(false)
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Lazy-load fingerprint — only when user is about to vote (saves ~50KB on initial load)
  const fingerprintLoading = useRef(false)
  async function ensureFingerprint(): Promise<string> {
    if (fingerprint) return fingerprint
    if (fingerprintLoading.current) {
      // Already loading — wait briefly then read state
      await new Promise(r => setTimeout(r, 200))
      return fingerprint
    }
    fingerprintLoading.current = true
    const fp = await FingerprintJS.load()
    const r = await fp.get()
    setFingerprint(r.visitorId)
    fingerprintLoading.current = false
    return r.visitorId
  }

  // First-visit hint
  const [showHint, setShowHint] = useState(false)
  useEffect(() => {
    const seen = typeof window !== 'undefined' ? localStorage.getItem('majority_seen_hint') : '1'
    if (!seen) setShowHint(true)
  }, [])
  function dismissHint() {
    setShowHint(false)
    localStorage.setItem('majority_seen_hint', '1')
  }

  useEffect(() => {
    const saved = localStorage.getItem('majority_channel')
    setChannel(saved || 'global')
  }, [])

  function handleChannelSelect(id: string) {
    localStorage.setItem('majority_channel', id)
    setChannel(id)
  }

  useEffect(() => {
    if (!channel) return
    async function fetchPolls() {
      let query = supabase
        .from('polls')
        .select('id, question, option_1, option_2, created_at')
        .eq('is_active', true)
        .eq('is_archived', false)
        .order('created_at', { ascending: false })

      if (channel !== 'global') {
        query = query.eq('channel', channel)
      }

      const { data: pollData } = await query

      if (!pollData || pollData.length === 0) { setPolls([]); setLoading(false); return }

      const { data: voteData } = await supabase
        .from('votes').select('poll_id, choice')
        .in('poll_id', pollData.map(p => p.id))

      const totMap: Record<string, { a: number; b: number; total: number }> = {}
      voteData?.forEach(v => {
        const tot = totMap[v.poll_id] ?? { a: 0, b: 0, total: 0 }
        if (v.choice === 1) tot.a++; else if (v.choice === 2) tot.b++
        tot.total = tot.a + tot.b; totMap[v.poll_id] = tot
      })

      setPolls(pollData.map(p => ({
        ...p,
        voteCount: totMap[p.id]?.total ?? 0,
        totals: totMap[p.id] ?? { a: 0, b: 0, total: 0 },
      })).sort((a, b) => b.voteCount - a.voteCount))
      setLoading(false)
    }
    fetchPolls()
  }, [channel])

  // Auto-open poll modal when arriving via shared URL ?poll=ID
  useEffect(() => {
    if (polls.length === 0 || modal) return
    const params = new URLSearchParams(window.location.search)
    const pollIdFromUrl = params.get('poll')
    if (!pollIdFromUrl) return
    const poll = polls.find(p => p.id === pollIdFromUrl)
    if (!poll) return
    const { colorA, colorB } = assignPalette(poll.id)
    openModal(poll, colorA, colorB)
    // Strip the query so refresh doesn't re-open
    window.history.replaceState({}, '', window.location.pathname)
    // openModal is stable enough — disable lint warning
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [polls])

  const planets = useMemo(() => {
    const n = polls.length
    if (n === 0) return []

    // Large planet radii — fill the screen like the reference design
    const minR = vw < 480 ? 90  : vw < 768 ? 115 : 140
    const maxR = vw < 480 ? 135 : vw < 768 ? 170 : 210
    const radii = polls.map(p =>
      Math.min(minR + Math.sqrt(p.voteCount) * 4, maxR)
    )

    // Hero text ends roughly here — mobile needs more room (text wraps more)
    const heroBottom = Math.max(72, vh * 0.10) + (vw < 480 ? 310 : 250)

    // Initial x: spread evenly across full width, outermost planets bleed off edges
    const positions: { x: number; y: number }[] = polls.map((poll, i) => {
      const r = radii[i]
      const s1 = det(poll.id, 11)
      const s2 = det(poll.id, 22)

      const t = n === 1 ? 0.5 : i / (n - 1)
      const xLeft  = n <= 2 ? r * 0.5 : -r * 0.1
      const xRight = n <= 2 ? vw - r * 0.5 : vw + r * 0.1
      const x = xLeft + t * (xRight - xLeft) + (s1 - 0.5) * r * 0.4

      // Two staggered rows; keep within viewport vertically
      const row = i % 2
      const yRow = heroBottom + r + row * r * 0.55 + (s2 - 0.5) * r * 0.2
      const y = Math.min(yRow, vh - r * 0.45)

      return { x, y }
    })

    // Collision avoidance — push overlapping planets apart
    for (let iter = 0; iter < 40; iter++) {
      let moved = false
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          const dx = positions[j].x - positions[i].x
          const dy = positions[j].y - positions[i].y
          const dist = Math.hypot(dx, dy) || 0.001
          const need = radii[i] + radii[j] + MIN_GAP
          if (dist < need) {
            const over = (need - dist) / 2
            const nx = dx / dist, ny = dy / dist
            positions[i].x -= nx * over * 0.7
            positions[j].x += nx * over * 0.7
            positions[i].y -= ny * over * 0.3
            positions[j].y += ny * over * 0.3
            moved = true
          }
        }
      }
      if (!moved) break
    }

    return polls.map((poll, i) => {
      const r = radii[i]
      const { colorA, colorB } = assignPalette(poll.id)
      const seed = det(poll.id, 99)
      const floatDur  = 2.8 + seed * 2.8   // 2.8s – 5.6s, each planet different
      const floatDelay = -(seed * floatDur)
      const amp = 15 + Math.round(seed * 13) // 15–28px — lively independent float

      return { poll, r, x: positions[i].x, y: positions[i].y, colorA, colorB, floatDur, floatDelay, amp }
    })
  }, [polls, vw, vh])

  const askPos = useMemo(() => {
    const fallbackX = vw * 0.5
    const fallbackY = vh * 0.75
    if (planets.length === 0) return { x: fallbackX, y: fallbackY }

    // Find a gap inside the planet cluster
    const midX = planets.reduce((s, p) => s + p.x, 0) / planets.length
    const midY = planets.reduce((s, p) => s + p.y, 0) / planets.length
    for (let dist = 0; dist <= 500; dist += 18) {
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
        const ax = midX + Math.cos(a) * dist
        const ay = midY + Math.sin(a) * dist
        if (planets.every(p => Math.hypot(ax - p.x, ay - p.y) >= ASK_R + p.r + 20))
          return { x: ax, y: ay }
      }
    }
    const maxY = Math.max(...planets.map(p => p.y + p.r))
    return { x: midX, y: maxY + 24 + ASK_R }
  }, [planets, vw, vh])

  // Physics bounce animation — declared after planets/askPos useMemos
  const containerRefs = useRef<(HTMLDivElement | null)[]>([])
  const physicsRef = useRef<{ x: number; y: number; vx: number; vy: number; spd: number }[]>([])
  const rafRef = useRef<number | null>(null)
  const hoveredIdxRef = useRef<number | null>(null)

  useEffect(() => {
    if (planets.length === 0) return
    const heroBottom = Math.max(72, vh * 0.10) + (vw < 480 ? 310 : 250)
    const pad = 28

    physicsRef.current = planets.map(p => {
      const angle = det(p.poll.id, 55) * Math.PI * 2
      const spd = 0.5 + det(p.poll.id, 66) * 0.65
      return { x: p.x, y: p.y, vx: Math.cos(angle) * spd, vy: Math.sin(angle) * spd, spd }
    })

    const tick = () => {
      physicsRef.current.forEach((pos, i) => {
        if (i === hoveredIdxRef.current) return
        const planet = planets[i]
        if (!planet) return
        const { r, amp } = planet

        pos.vx += (Math.random() - 0.5) * 0.018
        pos.vy += (Math.random() - 0.5) * 0.018
        const s = Math.hypot(pos.vx, pos.vy) || 0.001
        if (s > pos.spd * 2.0) { pos.vx *= pos.spd * 2.0 / s; pos.vy *= pos.spd * 2.0 / s }
        if (s < pos.spd * 0.3) { pos.vx *= pos.spd * 0.3 / s; pos.vy *= pos.spd * 0.3 / s }

        pos.x += pos.vx
        pos.y += pos.vy

        if (pos.x - r < pad)              { pos.x = pad + r;              pos.vx =  Math.abs(pos.vx) }
        if (pos.x + r > vw - pad)         { pos.x = vw - pad - r;         pos.vx = -Math.abs(pos.vx) }
        if (pos.y - r < heroBottom + amp) { pos.y = heroBottom + amp + r;  pos.vy =  Math.abs(pos.vy) }
        if (pos.y + r > vh - pad - amp)   { pos.y = vh - pad - amp - r;    pos.vy = -Math.abs(pos.vy) }

        const el = containerRefs.current[i]
        if (el) el.style.transform = `translate(${pos.x - r}px, ${pos.y - r}px)`
      })
      rafRef.current = requestAnimationFrame(tick)
    }

    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null } }
  }, [planets, vw, vh])

  const totalVotes = polls.reduce((s, p) => s + p.voteCount, 0)
  const ch = channel || 'global'

  function startCountdown() {
    if (countdownRef.current) clearInterval(countdownRef.current)
    setCountdown(25)
    let remaining = 25
    countdownRef.current = setInterval(() => {
      remaining--
      setCountdown(remaining)
      if (remaining <= 0) {
        clearInterval(countdownRef.current!)
        countdownRef.current = null
        setModal(null)
      }
    }, 1000)
  }

  function closeModal() {
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null }
    setModal(null)
  }

  async function openModal(poll: PollData, colorA: string, colorB: string) {
    if (modal) return
    setShareCopied(false)
    if (showHint) dismissHint()
    const stored = typeof window !== 'undefined' ? localStorage.getItem(`voted_${poll.id}`) : null
    if (stored) {
      // Verify the vote still exists in DB — admin may have deleted it
      const { choice } = JSON.parse(stored) as { choice: 1 | 2 }
      const { count } = await supabase
        .from('votes').select('id', { count: 'exact', head: true })
        .eq('poll_id', poll.id)
      if ((count ?? 0) === 0) {
        // DB was cleared — stale localStorage, let them vote again
        localStorage.removeItem(`voted_${poll.id}`)
      } else {
        setModal({ poll, colorA, colorB, phase: 'result', voted: choice, totals: poll.totals })
        startCountdown()
        // Lazy-load breakdown
        fetchBreakdown(poll.id).then(breakdown => {
          setModal(prev => prev ? { ...prev, breakdown } : null)
        })
        return
      }
    }
    setModal({ poll, colorA, colorB, phase: 'expanding' })
    setTimeout(() => setModal(prev => prev ? { ...prev, phase: 'choosing' } : null), 750)
  }

  async function changeVote(newChoice: 1 | 2) {
    if (!modal || !modal.voted || modal.voted === newChoice) return
    const stored = localStorage.getItem(`voted_${modal.poll.id}`)
    if (!stored) return
    const parsed = JSON.parse(stored) as { ts: number; changed?: boolean }
    if (parsed.changed) { alert('You\'ve already changed your vote once.'); return }
    if (Date.now() - parsed.ts > 5 * 60 * 1000) { alert('Vote change window (5 min) has passed.'); return }
    const fp = await ensureFingerprint()
    const res = await fetch('/api/vote', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ poll_id: modal.poll.id, choice: newChoice, fingerprint: fp }),
    })
    const result = await res.json()
    if (!res.ok) {
      alert(result.error || 'Failed to change vote')
      return
    }
    // Adjust totals
    const t = modal.totals ?? modal.poll.totals
    const adjusted = {
      a: t.a + (newChoice === 1 ? 1 : -1),
      b: t.b + (newChoice === 2 ? 1 : -1),
      total: t.total,
    }
    localStorage.setItem(`voted_${modal.poll.id}`, JSON.stringify({ choice: newChoice, ts: parsed.ts, changed: true }))
    const breakdown = await fetchBreakdown(modal.poll.id)
    setModal(prev => prev ? { ...prev, voted: newChoice, totals: adjusted, breakdown } : null)
  }

  async function handleShare() {
    if (!modal) return
    const url = `${window.location.origin}/p/${modal.poll.id}`
    try {
      await navigator.clipboard.writeText(url)
      setShareCopied(true)
      setTimeout(() => setShareCopied(false), 2500)
    } catch {
      // Fallback: select text in a temp input
      const ta = document.createElement('textarea')
      ta.value = url; document.body.appendChild(ta)
      ta.select(); document.execCommand('copy')
      document.body.removeChild(ta)
      setShareCopied(true)
      setTimeout(() => setShareCopied(false), 2500)
    }
  }

  async function submitVote(choice: 1 | 2) {
    if (!modal || modal.phase !== 'choosing') return
    const fp = await ensureFingerprint()
    if (!fp) return
    const optimistic = {
      a: modal.poll.totals.a + (choice === 1 ? 1 : 0),
      b: modal.poll.totals.b + (choice === 2 ? 1 : 0),
      total: modal.poll.totals.total + 1,
    }
    const res = await fetch('/api/vote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        poll_id: modal.poll.id,
        choice,
        fingerprint: fp,
      }),
    })
    const result = await res.json()
    if (!res.ok) {
      // Already voted from another browser/device — show result anyway
      if (result.error === 'Already voted') {
        localStorage.setItem(`voted_${modal.poll.id}`, JSON.stringify({ choice, ts: Date.now() }))
        const breakdown = await fetchBreakdown(modal.poll.id)
        setModal(prev => prev ? { ...prev, phase: 'result', voted: choice, totals: modal.poll.totals, breakdown } : null)
        startCountdown()
        return
      }
      setDemoError(result.error || 'Failed to vote')
      return
    }
    // Always show demographic confirm step — prefill if we have saved values
    const savedDemo = typeof window !== 'undefined' ? localStorage.getItem('majority_demo') : null
    const parsed = savedDemo ? JSON.parse(savedDemo) : null
    setDemoAge(parsed?.age != null ? String(parsed.age) : '')
    setDemoGender(parsed?.gender ?? '')
    setDemoError('')
    setModal(prev => prev ? { ...prev, phase: 'demographic', voted: choice, totals: optimistic } : null)
  }

  async function submitDemographic() {
    const ageNum = parseInt(demoAge)
    if (!demoAge || ageNum < 1 || ageNum > 120) { setDemoError('Please enter a valid age.'); return }
    if (!demoGender) { setDemoError('Please select your gender.'); return }
    if (!modal) return
    setDemoError(''); setDemoSubmitting(true)
    const fp = await ensureFingerprint()
    localStorage.setItem('majority_demo', JSON.stringify({ age: ageNum, gender: demoGender }))
    localStorage.setItem(`voted_${modal.poll.id}`, JSON.stringify({ choice: modal.voted, ts: Date.now() }))
    await fetch('/api/update-demographic', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ poll_id: modal.poll.id, fingerprint: fp, age: ageNum, gender: demoGender }),
    })
    const breakdown = await fetchBreakdown(modal.poll.id)
    setModal(prev => prev ? { ...prev, phase: 'result', breakdown } : null)
    setDemoSubmitting(false)
    startCountdown()
  }

  const serif = '"Cormorant Garamond", Georgia, "Times New Roman", serif'
  const textColor = day ? '#2a1a5e' : '#f5f0e8'
  const subColor  = day ? '#7a6a9e' : '#b0a8cc'
  const bgGradient = day
    ? 'linear-gradient(160deg, #d6e9f5 0%, #f3e5d0 60%, #ffd9b8 100%)'
    : 'linear-gradient(160deg, #1a0e3a 0%, #2d1b5e 45%, #1e1040 100%)'

  function renderHeadline() {
    const template = t(ch, 'home.headline')
    const theWord = t(ch, 'home.headline.the')
    if (theWord && template.includes('{the}')) {
      const parts = template.split('{the}')
      return <>{parts[0]}<em style={{ fontStyle: 'italic' }}>{theWord}</em>{parts[1]}</>
    }
    return template
  }

  return (
    <div style={{ width: '100vw', height: '100dvh', overflow: 'hidden', position: 'relative', background: bgGradient }}>

      {!day && <Stars vw={vw} vh={vh} />}

      <div style={{
        position: 'absolute', top: '10%', right: '5%',
        width: vw < 480 ? 70 : day ? 140 : 120,
        height: vw < 480 ? 70 : day ? 140 : 120,
        borderRadius: '50%',
        background: day
          ? 'radial-gradient(circle, #ffe7b8 0%, #ffb05a 65%, transparent 100%)'
          : 'radial-gradient(circle, #f8eecf 0%, #e0c688 55%, transparent 100%)',
        filter: 'blur(2px)', opacity: 0.9, pointerEvents: 'none',
      }} />

      {/* Header */}
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: vw < 480 ? '14px 16px' : '20px 28px', pointerEvents: 'none',
      }}>
        <div style={{ pointerEvents: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <svg width="28" height="20" viewBox="0 0 32 22" fill="none" style={{ opacity: 0.9 }}>
            <ellipse cx="16" cy="11" rx="14" ry="5" stroke={textColor} strokeWidth="1.5" fill="none" opacity="0.5"
              style={{ clipPath: 'inset(50% 0 0 0)' }} />
            <circle cx="16" cy="11" r="8" fill={textColor} opacity="0.92" />
            <ellipse cx="16" cy="11" rx="14" ry="5" stroke={textColor} strokeWidth="1.5" fill="none" opacity="0.85"
              style={{ clipPath: 'inset(0 0 50% 0)' }} />
          </svg>
          <h1 style={{ fontSize: vw < 480 ? 20 : 26, fontWeight: 700, color: textColor, margin: 0, fontFamily: serif }}>Majority</h1>
        </div>
        <div style={{ display: 'flex', gap: vw < 480 ? 6 : 10, alignItems: 'center', pointerEvents: 'auto' }}>
          {channel && (
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setShowChannelDropdown(v => !v)}
                style={{
                  background: 'none', cursor: 'pointer',
                  color: textColor, fontSize: 13, fontWeight: 500,
                  padding: vw < 480 ? '7px 10px' : '9px 14px', borderRadius: 100,
                  border: `1px solid ${day ? 'rgba(42,26,94,0.2)' : 'rgba(245,240,232,0.2)'}`,
                  display: 'flex', alignItems: 'center', gap: 4,
                  fontFamily: 'inherit',
                }}
              >
                <span style={{ fontSize: 16 }}>{getChannel(channel).flag}</span>
                {vw >= 480 && <span>{getChannel(channel).name}</span>}
              </button>
              {showChannelDropdown && (
                <div style={{
                  position: 'absolute', top: '110%', right: 0,
                  background: day ? 'rgba(255,255,255,0.95)' : 'rgba(15,12,35,0.95)',
                  border: `1px solid ${day ? 'rgba(42,26,94,0.12)' : 'rgba(245,240,232,0.12)'}`,
                  borderRadius: 16, padding: '8px', zIndex: 200,
                  backdropFilter: 'blur(20px)',
                  minWidth: 200, maxHeight: 360, overflowY: 'auto',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
                }}>
                  {CHANNELS.map(c => (
                    <button key={c.id} onClick={() => { handleChannelSelect(c.id); setShowChannelDropdown(false) }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        width: '100%', padding: '10px 12px', borderRadius: 10,
                        border: 'none', background: channel === c.id
                          ? (day ? 'rgba(42,26,94,0.08)' : 'rgba(245,240,232,0.08)')
                          : 'transparent',
                        cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                      }}>
                      <span style={{ fontSize: 18 }}>{c.flag}</span>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: textColor }}>{c.name}</div>
                        <div style={{ fontSize: 11, color: day ? '#7a6a9e' : '#b0a8cc' }}>{c.language}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {/* My polls — hidden on mobile to save space */}
          {vw >= 480 && (
            <a href="/dashboard" style={{
              color: textColor, fontSize: 13, fontWeight: 500, textDecoration: 'none',
              padding: '9px 18px', borderRadius: 100,
              border: `1px solid ${day ? 'rgba(42,26,94,0.2)' : 'rgba(245,240,232,0.2)'}`,
            }}>
              {t(ch, 'nav.mypolls')}
            </a>
          )}
          {/* Ask — hidden on mobile (ASK planet handles it) */}
          {vw >= 480 && (
            <a href="/create" style={{
              background: day ? 'rgba(42,26,94,0.85)' : 'rgba(245,240,232,0.12)',
              color: day ? '#fff' : textColor,
              border: `1px solid ${day ? 'transparent' : 'rgba(245,240,232,0.3)'}`,
              padding: '9px 22px', borderRadius: 100,
              fontSize: 13, fontWeight: 600, textDecoration: 'none',
            }}>
              {t(ch, 'nav.ask')}
            </a>
          )}
          {/* Day/night toggle */}
          <button
            onClick={() => setDayNightOverride(!day)}
            aria-label="Toggle day/night"
            style={{
              background: day ? 'rgba(42,26,94,0.1)' : 'rgba(245,240,232,0.1)',
              border: `1px solid ${day ? 'rgba(42,26,94,0.2)' : 'rgba(245,240,232,0.2)'}`,
              borderRadius: 100, padding: vw < 480 ? '6px 8px' : '7px 12px',
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
              backdropFilter: 'blur(8px)',
              transition: 'background 0.3s',
            }}
          >
            <span style={{ fontSize: 14 }}>{day ? '☀️' : '🌙'}</span>
            {vw >= 480 && (
              <div style={{
                width: 32, height: 18, borderRadius: 100,
                background: day ? 'rgba(42,26,94,0.3)' : 'rgba(245,240,232,0.3)',
                position: 'relative', transition: 'background 0.3s',
              }}>
                <div style={{
                  position: 'absolute', top: 2, left: day ? 14 : 2,
                  width: 14, height: 14, borderRadius: '50%',
                  background: day ? '#2a1a5e' : '#f5f0e8',
                  transition: 'left 0.25s cubic-bezier(0.4,0,0.2,1)',
                }} />
              </div>
            )}
          </button>
        </div>
      </div>

      {/* Hero text */}
      {!loading && (
        <div style={{
          position: 'absolute', top: 'max(72px, 10%)', left: 0, right: 0,
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          gap: 8, padding: '0 24px', pointerEvents: 'none', zIndex: 10,
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            fontSize: 11, fontWeight: 600, letterSpacing: '0.12em',
            color: subColor, textTransform: 'uppercase',
          }}>
            <span style={{
              width: 7, height: 7, borderRadius: '50%', background: '#4ade80',
              boxShadow: '0 0 6px #4ade80', display: 'inline-block', flexShrink: 0,
            }} />
            {t(ch, day ? 'home.status.day' : 'home.status.night')} · {t(ch, 'home.status.live')} · {formatVotes(totalVotes)} {t(ch, 'home.status.voting')}
          </div>

          <div style={{
            fontFamily: serif,
            fontSize: 'clamp(34px, 6vw, 76px)',
            fontWeight: 400, color: textColor,
            textAlign: 'center', lineHeight: 1.08,
            maxWidth: 700,
          }}>
            {renderHeadline()}
          </div>

          <p style={{
            fontSize: 'clamp(13px, 1.6vw, 15px)', color: subColor,
            textAlign: 'center', maxWidth: 400, lineHeight: 1.65, margin: 0,
          }}>
            {t(ch, 'home.subtext')}
          </p>
        </div>
      )}

      {loading && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: 10, color: subColor, fontSize: 14,
        }}>
          <span style={{
            width: 10, height: 10, borderRadius: '50%',
            background: subColor, opacity: 0.6,
            animation: 'cosmosTwinkle 1.2s ease-in-out infinite',
          }} />
          Aligning the planets…
        </div>
      )}

      {!loading && polls.length === 0 && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          gap: 14, padding: '0 24px', textAlign: 'center',
        }}>
          <div style={{ fontSize: 56, opacity: 0.6 }}>🌌</div>
          <p style={{ margin: 0, color: textColor, fontSize: 22, fontWeight: 600, fontFamily: serif }}>
            The cosmos is empty
          </p>
          <p style={{ margin: 0, color: subColor, fontSize: 14, maxWidth: 280, lineHeight: 1.55 }}>
            No polls in this channel yet. Be the first to ask the world something.
          </p>
          <button onClick={() => router.push('/create')} style={{
            marginTop: 4,
            background: day ? '#2a1a5e' : '#f5f0e8',
            color: day ? '#fff' : '#1a0e3a',
            border: 'none', borderRadius: 100,
            padding: '12px 28px', fontSize: 14, fontWeight: 700,
            cursor: 'pointer', fontFamily: 'inherit',
            boxShadow: day ? '0 8px 24px rgba(42,26,94,0.25)' : '0 8px 24px rgba(0,0,0,0.4)',
          }}>
            + Ask the world
          </button>
        </div>
      )}

      {/* Planet cluster */}
      {!loading && polls.length > 0 && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 5 }}>
          {planets.map(({ poll, r, colorA, colorB, floatDur, floatDelay, amp }, idx) => {
            const mid = mixHex(colorA, colorB)
            const gradient = `radial-gradient(circle at 35% 32%, ${colorA} 0%, ${mid} 52%, ${colorB} 100%)`
            return (
              // Outer div: RAF moves this via transform (drift/bounce)
              <div
                key={poll.id}
                ref={el => { containerRefs.current[idx] = el }}
                style={{
                  position: 'absolute', left: 0, top: 0,
                  width: r * 2, height: r * 2,
                  zIndex: 5, pointerEvents: 'none',
                }}
              >
                {/* NEW badge — polls created within 24h */}
                {poll.created_at && (Date.now() - new Date(poll.created_at).getTime()) < 86400000 && (
                  <div style={{
                    position: 'absolute', top: 8, right: 8, zIndex: 2,
                    background: 'linear-gradient(135deg, #ff5252, #ff9100)',
                    color: '#fff', fontSize: 10, fontWeight: 800,
                    letterSpacing: '0.1em', padding: '4px 10px',
                    borderRadius: 100, boxShadow: '0 4px 12px rgba(255,82,82,0.35)',
                    pointerEvents: 'none',
                  }}>
                    NEW
                  </div>
                )}
                {/* Inner button: CSS planetFloat handles the vertical bob */}
                <button
                  onClick={() => openModal(poll, colorA, colorB)}
                  aria-label={poll.question}
                  style={{
                    position: 'absolute', inset: 0,
                    borderRadius: '50%', border: 'none', cursor: 'pointer',
                    background: gradient,
                    boxShadow: `0 8px 32px ${colorA}66, 0 2px 12px ${colorB}55`,
                    display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center',
                    textAlign: 'center', padding: 14,
                    ['--amp' as string]: String(amp),
                    animation: `planetFloat ${floatDur}s ease-in-out ${floatDelay}s infinite`,
                    transition: 'box-shadow 0.3s ease',
                    pointerEvents: 'auto',
                  }}
                  onMouseEnter={e => { hoveredIdxRef.current = idx; (e.currentTarget as HTMLElement).style.animationPlayState = 'paused' }}
                  onMouseLeave={e => { hoveredIdxRef.current = null; (e.currentTarget as HTMLElement).style.animationPlayState = 'running' }}
                >
                  <span style={{
                    color: '#fff', fontWeight: 700,
                    fontSize: r > 160 ? 16 : r > 130 ? 15 : r > 100 ? 14 : 13,
                    lineHeight: 1.35, textShadow: '0 1px 10px rgba(0,0,0,0.4)',
                    display: '-webkit-box', WebkitLineClamp: 4,
                    WebkitBoxOrient: 'vertical', overflow: 'hidden',
                    maxWidth: '82%',
                  }}>
                    {poll.question}
                  </span>
                  {poll.voteCount > 0 && (
                    <span style={{
                      color: 'rgba(255,255,255,0.65)',
                      fontSize: r > 140 ? 11 : 10,
                      fontWeight: 500, marginTop: 6,
                      letterSpacing: '0.04em',
                      textShadow: '0 1px 6px rgba(0,0,0,0.3)',
                    }}>
                      {formatVotes(poll.voteCount)} votes
                    </span>
                  )}
                </button>
              </div>
            )
          })}

          {/* ASK planet — crystal clear glass orb */}
          {(() => {
            const r = ASK_R
            const dashLen = (2 * Math.PI * (r - 2)) / 12
            return (
              <button
                onClick={() => router.push('/create')}
                aria-label="Ask the world a question"
                style={{
                  position: 'absolute',
                  left: askPos.x - ASK_R, top: askPos.y - ASK_R,
                  width: ASK_R * 2, height: ASK_R * 2,
                  borderRadius: '50%', border: 'none',
                  background: 'radial-gradient(circle at 32% 28%, rgba(255,255,255,0.55) 0%, rgba(220,240,255,0.22) 45%, rgba(180,220,255,0.08) 100%)',
                  backdropFilter: 'blur(12px)',
                  WebkitBackdropFilter: 'blur(12px)',
                  boxShadow: '0 4px 28px rgba(180,220,255,0.35), inset 0 1px 2px rgba(255,255,255,0.6)',
                  cursor: 'pointer', padding: 0,
                  ['--amp' as string]: '14',
                  animation: 'planetFloat 4.8s ease-in-out -1.4s infinite',
                  zIndex: 6,
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.animationPlayState = 'paused' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.animationPlayState = 'running' }}
              >
                {/* Dashed crystal border ring */}
                <svg width={r * 2} height={r * 2} viewBox={`0 0 ${r * 2} ${r * 2}`} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
                  <circle
                    cx={r} cy={r} r={r - 2}
                    fill="none"
                    stroke="rgba(255,255,255,0.7)"
                    strokeWidth="1.5"
                    strokeDasharray={`${dashLen * 0.5} ${dashLen * 0.5}`}
                    strokeLinecap="round"
                  />
                </svg>
                {/* Content */}
                <div style={{
                  position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center', gap: 3,
                }}>
                  <span style={{ color: '#fff', fontSize: 26, fontWeight: 300, lineHeight: 1, opacity: 0.95, textShadow: '0 1px 8px rgba(100,180,255,0.6)' }}>+</span>
                  <span style={{ color: '#fff', fontSize: 12, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', textShadow: '0 1px 8px rgba(100,180,255,0.5)' }}>
                    ASK
                  </span>
                  <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 9, fontWeight: 400, letterSpacing: '0.05em' }}>
                    your own
                  </span>
                </div>
              </button>
            )
          })()}
        </div>
      )}

      {/* Poll Modal */}
      {modal && (() => {
        const size = Math.min(vw * 0.78, vh * 0.52, 460)
        const rawTotals = modal.totals ?? modal.poll.totals
        // If total is still 0 but we know who voted, show 1 vote
        const totals = (rawTotals.total === 0 && modal.voted)
          ? { a: modal.voted === 1 ? 1 : 0, b: modal.voted === 2 ? 1 : 0, total: 1 }
          : rawTotals
        const pctA = totals.total > 0 ? Math.round(totals.a / totals.total * 100) : 50
        const pctB = totals.total > 0 ? 100 - pctA : 50
        const mid = mixHex(modal.colorA, modal.colorB)
        return (
          <div
            style={{
              position: 'fixed', inset: 0, zIndex: 200,
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'flex-start',
              background: 'rgba(0,0,0,0.68)',
              backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
              animation: 'cosmosFadeUp 0.3s ease forwards',
              overflowY: 'auto', padding: '32px 16px',
            }}
            onClick={closeModal}
          >
            {/* Close (X) button — top right */}
            <button
              onClick={closeModal}
              aria-label="Close"
              style={{
                position: 'fixed', top: 18, right: 18, zIndex: 210,
                width: 40, height: 40, borderRadius: '50%',
                background: 'rgba(255,255,255,0.12)',
                border: '1px solid rgba(255,255,255,0.18)',
                color: '#fff', fontSize: 20, lineHeight: 1, cursor: 'pointer',
                backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              ×
            </button>
            <div
              onClick={e => e.stopPropagation()}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                gap: 18, margin: 'auto', width: '100%', maxWidth: 480,
              }}
            >
              {/* Phase: expanding — big planet with question */}
              {modal.phase === 'expanding' && (
                <div style={{
                  width: size, height: size, borderRadius: '50%',
                  background: `radial-gradient(circle at 35% 32%, ${modal.colorA} 0%, ${mid} 52%, ${modal.colorB} 100%)`,
                  boxShadow: `0 24px 80px ${modal.colorA}88, 0 8px 32px ${modal.colorB}55`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: 32, textAlign: 'center',
                  animation: 'cosmosFadeUp 0.4s cubic-bezier(0.2,0.8,0.2,1) forwards',
                }}>
                  <span style={{
                    color: '#fff', fontSize: size > 350 ? 22 : 18,
                    fontWeight: 700, lineHeight: 1.4,
                    textShadow: '0 2px 12px rgba(0,0,0,0.3)',
                  }}>
                    {modal.poll.question}
                  </span>
                </div>
              )}

              {/* Phase: demographic form */}
              {modal.phase === 'demographic' && (() => {
                const cardW = Math.min(vw * 0.88, 380)
                const isDark = !day
                return (
                  <div style={{
                    width: cardW,
                    background: isDark
                      ? 'linear-gradient(160deg, rgba(26,18,58,0.96) 0%, rgba(15,12,35,0.96) 100%)'
                      : 'linear-gradient(160deg, rgba(255,255,255,0.97) 0%, rgba(248,244,255,0.97) 100%)',
                    border: `1px solid ${isDark ? 'rgba(180,160,255,0.15)' : 'rgba(42,26,94,0.1)'}`,
                    borderRadius: 28, padding: '36px 28px 28px',
                    backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
                    boxShadow: isDark
                      ? '0 32px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04)'
                      : '0 24px 60px rgba(42,26,94,0.12), 0 0 0 1px rgba(42,26,94,0.04)',
                    animation: 'cosmosFadeUp 0.38s cubic-bezier(0.2,0.8,0.2,1) forwards',
                  }}>
                    {/* Icon */}
                    <div style={{
                      width: 44, height: 44, borderRadius: '50%', marginBottom: 16,
                      background: isDark
                        ? 'linear-gradient(135deg, #7c4dff, #448aff)'
                        : 'linear-gradient(135deg, #a78bfa, #60a5fa)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 20,
                    }}>
                      🌍
                    </div>
                    <p style={{
                      fontSize: 20, fontWeight: 700, lineHeight: 1.2, margin: '0 0 8px',
                      color: isDark ? '#f0f0f8' : '#1a1a2e',
                      fontFamily: '"Cormorant Garamond", Georgia, serif',
                    }}>
                      {demoAge && demoGender ? 'Still you?' : 'One quick thing'}
                    </p>
                    <p style={{ fontSize: 13, margin: '0 0 28px', lineHeight: 1.5,
                      color: isDark ? 'rgba(200,190,240,0.7)' : 'rgba(42,26,94,0.5)' }}>
                      {demoAge && demoGender
                        ? 'Confirm or correct before we save your vote'
                        : 'Help us show how different groups voted'}
                    </p>

                    {demoError && (
                      <p style={{ color: '#f87171', fontSize: 13, margin: '0 0 16px',
                        background: 'rgba(248,113,113,0.1)', padding: '8px 12px', borderRadius: 10 }}>
                        {demoError}
                      </p>
                    )}

                    {/* Age input */}
                    <div style={{ marginBottom: 12 }}>
                      <label style={{ display: 'block', fontSize: 11, fontWeight: 600,
                        letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6,
                        color: isDark ? 'rgba(200,190,240,0.6)' : 'rgba(42,26,94,0.45)' }}>
                        Age
                      </label>
                      <input
                        type="number" value={demoAge}
                        onChange={e => setDemoAge(e.target.value)}
                        placeholder="e.g. 25" min={1} max={120}
                        style={{
                          width: '100%', padding: '13px 16px', fontSize: 15, borderRadius: 14,
                          border: `1.5px solid ${isDark ? 'rgba(180,160,255,0.2)' : 'rgba(42,26,94,0.15)'}`,
                          background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(42,26,94,0.04)',
                          color: isDark ? '#f0f0f8' : '#1a1a2e', outline: 'none',
                          transition: 'border-color 0.2s',
                        }}
                      />
                    </div>

                    {/* Gender */}
                    <div style={{ marginBottom: 28 }}>
                      <label style={{ display: 'block', fontSize: 11, fontWeight: 600,
                        letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6,
                        color: isDark ? 'rgba(200,190,240,0.6)' : 'rgba(42,26,94,0.45)' }}>
                        Gender
                      </label>
                      <div style={{ display: 'flex', gap: 8 }}>
                        {(['male', 'female', 'prefer_not_to_say'] as const).map((g) => {
                          const label = g === 'prefer_not_to_say' ? 'Other' : g.charAt(0).toUpperCase() + g.slice(1)
                          const active = demoGender === g
                          return (
                            <button key={g} onClick={() => setDemoGender(g)}
                              style={{
                                flex: 1, padding: '11px 8px', borderRadius: 12, border: 'none',
                                cursor: 'pointer', fontSize: 13, fontWeight: active ? 700 : 500,
                                transition: 'all 0.18s ease',
                                background: active
                                  ? (isDark ? 'linear-gradient(135deg,#7c4dff,#448aff)' : 'linear-gradient(135deg,#2a1a5e,#4a3a8e)')
                                  : (isDark ? 'rgba(255,255,255,0.07)' : 'rgba(42,26,94,0.06)'),
                                color: active ? '#fff' : (isDark ? 'rgba(200,190,240,0.8)' : 'rgba(42,26,94,0.6)'),
                                boxShadow: active ? (isDark ? '0 4px 16px rgba(124,77,255,0.4)' : '0 4px 16px rgba(42,26,94,0.2)') : 'none',
                              }}>
                              {label}
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    <button
                      onClick={submitDemographic} disabled={demoSubmitting}
                      style={{
                        width: '100%', padding: '15px', borderRadius: 100, border: 'none',
                        background: isDark
                          ? 'linear-gradient(135deg, #7c4dff, #448aff)'
                          : 'linear-gradient(135deg, #2a1a5e, #4a3a9e)',
                        color: '#fff', fontSize: 15, fontWeight: 700,
                        cursor: demoSubmitting ? 'default' : 'pointer',
                        opacity: demoSubmitting ? 0.7 : 1,
                        boxShadow: isDark ? '0 8px 32px rgba(124,77,255,0.35)' : '0 8px 24px rgba(42,26,94,0.25)',
                        transition: 'opacity 0.2s, transform 0.15s',
                        letterSpacing: '0.02em',
                      }}
                    >
                      {demoSubmitting ? 'Loading…' : 'Confirm & see results →'}
                    </button>
                  </div>
                )
              })()}

              {/* Phase: choosing / result — split circle */}
              {(modal.phase === 'choosing' || modal.phase === 'result') && (
                <>
                  <p style={{
                    color: '#fff', fontSize: size > 350 ? 18 : 15, fontWeight: 600,
                    textAlign: 'center', maxWidth: size, margin: 0,
                    textShadow: '0 2px 12px rgba(0,0,0,0.5)', lineHeight: 1.4,
                  }}>
                    {modal.poll.question}
                  </p>

                  <div style={{
                    width: size, height: size, borderRadius: '50%',
                    overflow: 'hidden', display: 'flex', position: 'relative',
                    boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
                    animation: modal.phase === 'choosing' ? 'cosmosFadeUp 0.4s cubic-bezier(0.2,0.8,0.2,1) forwards' : undefined,
                  }}>
                    {/* Option A */}
                    <button
                      disabled={modal.phase === 'result'}
                      onClick={() => submitVote(1)}
                      style={{
                        width: modal.phase === 'result' ? `${pctA}%` : '50%',
                        minWidth: '15%', height: '100%', border: 'none',
                        background: `linear-gradient(160deg, ${modal.colorA}, ${mid})`,
                        cursor: modal.phase === 'choosing' ? 'pointer' : 'default',
                        display: 'flex', flexDirection: 'column',
                        alignItems: 'center', justifyContent: 'center',
                        padding: '0 12px', textAlign: 'center',
                        transition: 'width 1s cubic-bezier(0.4,0,0.2,1)',
                        overflow: 'hidden',
                      }}
                    >
                      {modal.phase === 'result' && (
                        <span style={{ color: '#fff', fontSize: size > 350 ? 34 : 26, fontWeight: 900, lineHeight: 1 }}>
                          {pctA}%
                        </span>
                      )}
                      <span style={{
                        color: '#fff', fontSize: size > 350 ? 14 : 12, fontWeight: 600,
                        lineHeight: 1.3, marginTop: modal.phase === 'result' ? 6 : 0,
                        textShadow: '0 1px 8px rgba(0,0,0,0.4)',
                      }}>
                        {modal.poll.option_1}
                      </span>
                      {modal.phase === 'result' && modal.voted === 1 && (
                        <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: 10, marginTop: 5 }}>✓ your vote</span>
                      )}
                    </button>

                    {/* Divider */}
                    <div style={{
                      position: 'absolute',
                      left: modal.phase === 'result' ? `${pctA}%` : '50%',
                      top: '8%', bottom: '8%', width: 2,
                      background: 'rgba(255,255,255,0.45)',
                      transform: 'translateX(-50%)', zIndex: 1,
                      transition: 'left 1s cubic-bezier(0.4,0,0.2,1)',
                    }} />

                    {/* Option B */}
                    <button
                      disabled={modal.phase === 'result'}
                      onClick={() => submitVote(2)}
                      style={{
                        width: modal.phase === 'result' ? `${pctB}%` : '50%',
                        minWidth: '15%', height: '100%', border: 'none',
                        background: `linear-gradient(160deg, ${mid}, ${modal.colorB})`,
                        cursor: modal.phase === 'choosing' ? 'pointer' : 'default',
                        display: 'flex', flexDirection: 'column',
                        alignItems: 'center', justifyContent: 'center',
                        padding: '0 12px', textAlign: 'center',
                        transition: 'width 1s cubic-bezier(0.4,0,0.2,1)',
                        overflow: 'hidden',
                      }}
                    >
                      {modal.phase === 'result' && (
                        <span style={{ color: '#fff', fontSize: size > 350 ? 34 : 26, fontWeight: 900, lineHeight: 1 }}>
                          {pctB}%
                        </span>
                      )}
                      <span style={{
                        color: '#fff', fontSize: size > 350 ? 14 : 12, fontWeight: 600,
                        lineHeight: 1.3, marginTop: modal.phase === 'result' ? 6 : 0,
                        textShadow: '0 1px 8px rgba(0,0,0,0.4)',
                      }}>
                        {modal.poll.option_2}
                      </span>
                      {modal.phase === 'result' && modal.voted === 2 && (
                        <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: 10, marginTop: 5 }}>✓ your vote</span>
                      )}
                    </button>
                  </div>

                  {modal.phase === 'result' && (
                    <>
                      {/* Demographic breakdown */}
                      {modal.breakdown && totals.total > 0 && (
                        <div style={{
                          display: 'flex', flexDirection: 'column', gap: 12,
                          maxHeight: vh * 0.32, overflowY: 'auto',
                          width: '100%', maxWidth: 380,
                        }}>
                          <DemographicRings
                            title="By gender"
                            rows={[
                              { label: 'Male', a: modal.breakdown.gender.male[1], b: modal.breakdown.gender.male[2] },
                              { label: 'Female', a: modal.breakdown.gender.female[1], b: modal.breakdown.gender.female[2] },
                              { label: 'Other', a: modal.breakdown.gender.prefer_not_to_say[1], b: modal.breakdown.gender.prefer_not_to_say[2] },
                            ]}
                            colorA={modal.colorA} colorB={modal.colorB}
                            textColor="#fff" subColor="rgba(255,255,255,0.6)"
                            cardBg="rgba(255,255,255,0.06)" borderColor="rgba(255,255,255,0.1)"
                          />
                          <DemographicRings
                            title="By age"
                            rows={AGE_GROUPS.map(g => ({
                              label: g.label,
                              a: modal.breakdown!.age[g.label][1],
                              b: modal.breakdown!.age[g.label][2],
                            }))}
                            colorA={modal.colorA} colorB={modal.colorB}
                            textColor="#fff" subColor="rgba(255,255,255,0.6)"
                            cardBg="rgba(255,255,255,0.06)" borderColor="rgba(255,255,255,0.1)"
                          />
                        </div>
                      )}

                      {/* Change vote — 5 min window, once only */}
                      {(() => {
                        const stored = typeof window !== 'undefined' ? localStorage.getItem(`voted_${modal.poll.id}`) : null
                        if (!stored) return null
                        const parsed = JSON.parse(stored) as { ts?: number; choice: 1 | 2; changed?: boolean }
                        if (!parsed.ts || parsed.changed) return null
                        const elapsed = Date.now() - parsed.ts
                        if (elapsed > 5 * 60 * 1000) return null
                        const otherChoice = (modal.voted === 1 ? 2 : 1) as 1 | 2
                        const otherLabel = otherChoice === 1 ? modal.poll.option_1 : modal.poll.option_2
                        const minsLeft = Math.ceil((5 * 60 * 1000 - elapsed) / 60000)
                        return (
                          <button
                            onClick={() => changeVote(otherChoice)}
                            style={{
                              background: 'none', border: '1px dashed rgba(255,255,255,0.3)',
                              color: 'rgba(255,255,255,0.75)', fontSize: 12,
                              padding: '8px 16px', borderRadius: 100,
                              cursor: 'pointer', fontFamily: 'inherit',
                            }}
                          >
                            ↻ Change to &ldquo;{otherLabel}&rdquo; · {minsLeft}m
                          </button>
                        )
                      })()}

                      {/* Share button */}
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                        <button
                          onClick={handleShare}
                          style={{
                            background: 'rgba(255,255,255,0.12)',
                            border: '1px solid rgba(255,255,255,0.2)',
                            color: '#fff', fontSize: 13, fontWeight: 600,
                            padding: '10px 22px', borderRadius: 100,
                            cursor: 'pointer', backdropFilter: 'blur(10px)',
                            transition: 'background 0.2s',
                          }}
                        >
                          {shareCopied ? '✓ Link copied' : '↗ Share this poll'}
                        </button>
                      </div>

                      <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, margin: 0, textAlign: 'center' }}>
                        {totals.total.toLocaleString()} votes · closing in {countdown}s
                      </p>
                      <button
                        onClick={async () => {
                          if (!confirm('Report this poll for review?')) return
                          await fetch('/api/report', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ poll_id: modal.poll.id }),
                          })
                          alert('Thanks — we\'ll review it.')
                        }}
                        style={{
                          background: 'none', border: 'none',
                          color: 'rgba(255,255,255,0.35)', fontSize: 11,
                          cursor: 'pointer', textDecoration: 'underline',
                          padding: 0, marginTop: -4,
                        }}
                      >
                        Report poll
                      </button>
                    </>
                  )}
                  {modal.phase === 'choosing' && (
                    <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, margin: 0 }}>
                      tap a side to vote
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        )
      })()}

      {/* First-visit hint */}
      {showHint && !loading && polls.length > 0 && !modal && (
        <div
          onClick={dismissHint}
          style={{
            position: 'fixed', bottom: 70, left: '50%',
            transform: 'translateX(-50%)', zIndex: 90,
            background: day ? 'rgba(42,26,94,0.92)' : 'rgba(245,240,232,0.92)',
            color: day ? '#fff' : '#1a0e3a',
            padding: '10px 18px', borderRadius: 100,
            fontSize: 13, fontWeight: 600,
            display: 'flex', alignItems: 'center', gap: 8,
            backdropFilter: 'blur(12px)', cursor: 'pointer',
            boxShadow: '0 12px 32px rgba(0,0,0,0.25)',
            animation: 'cosmosFadeUp 0.5s ease forwards',
            maxWidth: 'calc(100vw - 32px)',
          }}
        >
          <span style={{ fontSize: 16 }}>👆</span>
          Tap a planet to vote
          <span style={{ opacity: 0.6, marginLeft: 4 }}>×</span>
        </div>
      )}

      {/* Bottom stats bar */}
      {!loading && (
        <div style={{
          position: 'fixed', bottom: 20, left: 0, right: 0,
          display: 'flex', justifyContent: 'center',
          pointerEvents: 'none', zIndex: 100,
        }}>
          <p style={{
            fontSize: 11, fontWeight: 600, letterSpacing: '0.1em',
            color: subColor, textTransform: 'uppercase', margin: 0,
          }}>
            {t(ch, 'home.stats')
              .replace('{n}', String(polls.length))
              .replace('{poll}', polls.length === 1 ? t(ch, 'home.poll') : t(ch, 'home.polls'))
              .replace('{votes}', formatVotes(totalVotes))}
            {' · '}
            <a href="/privacy" style={{ color: subColor, textDecoration: 'none', pointerEvents: 'auto' }}>Privacy</a>
          </p>
        </div>
      )}
    </div>
  )
}

function Stars({ vw, vh }: { vw: number; vh: number }) {
  const { stars, shootingStars } = useMemo(() => {
    const rng = mulberry32(42)
    const stars = Array.from({ length: 90 }, (_, i) => ({
      x: rng() * vw, y: rng() * vh * 0.88,
      size: 0.8 + rng() * 2, delay: rng() * 6, key: i,
    }))
    const rng2 = mulberry32(77)
    const shootingStars = Array.from({ length: 4 }, (_, i) => ({
      x: rng2() * vw * 0.5,
      y: rng2() * vh * 0.3,
      duration: 6 + rng2() * 7,
      delay: rng2() * 16,
      key: i,
    }))
    return { stars, shootingStars }
  }, [vw, vh])

  return (
    <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {stars.map(s => (
        <div key={s.key} style={{
          position: 'absolute', left: s.x, top: s.y,
          width: s.size, height: s.size, borderRadius: '50%',
          background: '#fff', opacity: 0.55,
          animation: `cosmosTwinkle 3.5s ease-in-out ${s.delay}s infinite`,
        }} />
      ))}
      {shootingStars.map(s => (
        <div key={s.key} className="shooting-star" style={{
          left: s.x, top: s.y,
          animationDuration: `${s.duration}s`,
          animationDelay: `${s.delay}s`,
        }} />
      ))}
    </div>
  )
}

function mulberry32(a: number) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let tt = a
    tt = Math.imul(tt ^ (tt >>> 15), tt | 1)
    tt ^= tt + Math.imul(tt ^ (tt >>> 7), tt | 61)
    return ((tt ^ (tt >>> 14)) >>> 0) / 4294967296
  }
}
