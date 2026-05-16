'use client'

import { useEffect, useState, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import FingerprintJS from '@fingerprintjs/fingerprintjs'
import { supabase } from '@/lib/supabase'
import { assignPalette } from '@/lib/theme'
import { useDayNight, setDayNightOverride } from '@/components/cosmos/useDayNight'
import { useViewport, useMouseParallax } from '@/components/cosmos/useOrbit'
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

// "trending" = poll with highest vote velocity (votes per hour since creation)
function trendingPollId(polls: PollData[]): string | null {
  if (polls.length === 0) return null
  let best: { id: string; v: number } | null = null
  for (const p of polls) {
    if (!p.created_at) continue
    const hoursSince = Math.max(0.5, (Date.now() - new Date(p.created_at).getTime()) / 3600000)
    const velocity = p.voteCount / hoursSince
    if (velocity < 3) continue // need some momentum
    if (!best || velocity > best.v) best = { id: p.id, v: velocity }
  }
  return best?.id ?? null
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
  const mouse = useMouseParallax()
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
  const [sortMode, setSortMode] = useState<'trending' | 'new' | 'top'>('trending')
  const [browseOpen, setBrowseOpen] = useState(false)
  const [browseSearch, setBrowseSearch] = useState('')
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

  // Pull-to-refresh (mobile gesture)
  const [pullDist, setPullDist] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const pullDistRef = useRef(0)
  useEffect(() => {
    let startY = 0
    let active = false
    function onTouchStart(e: TouchEvent) {
      if (window.scrollY > 0 || modal) return
      startY = e.touches[0].clientY
      active = true
    }
    function onTouchMove(e: TouchEvent) {
      if (!active) return
      const dy = e.touches[0].clientY - startY
      if (dy > 0) {
        const d = Math.min(120, dy * 0.6)
        pullDistRef.current = d
        setPullDist(d)
      }
    }
    function onTouchEnd() {
      if (!active) return
      active = false
      if (pullDistRef.current > 70) {
        setRefreshing(true)
        setChannel(c => c) // re-trigger fetch
        setTimeout(() => { setRefreshing(false); setPullDist(0); pullDistRef.current = 0 }, 700)
      } else {
        setPullDist(0); pullDistRef.current = 0
      }
    }
    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchmove', onTouchMove, { passive: true })
    window.addEventListener('touchend', onTouchEnd, { passive: true })
    return () => {
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('touchend', onTouchEnd)
    }
  }, [modal])

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

  // Real-time: increment vote counts as new votes come in
  useEffect(() => {
    if (polls.length === 0) return
    const pollIds = new Set(polls.map(p => p.id))
    const sub = supabase
      .channel('votes-feed')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'votes' }, payload => {
        const v = payload.new as { poll_id: string; choice: number }
        if (!pollIds.has(v.poll_id)) return
        setPolls(prev => prev.map(p => {
          if (p.id !== v.poll_id) return p
          const a = p.totals.a + (v.choice === 1 ? 1 : 0)
          const b = p.totals.b + (v.choice === 2 ? 1 : 0)
          return { ...p, voteCount: p.voteCount + 1, totals: { a, b, total: a + b } }
        }))
      })
      .subscribe()
    return () => { supabase.removeChannel(sub) }
  }, [polls.length])

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

  // Sort mode + visible cap (12 max planets to keep view breathable)
  const MAX_PLANETS = 12
  const visiblePolls = useMemo(() => {
    if (polls.length === 0) return polls
    const scored = polls.map(p => {
      const ageHours = Math.max(0.5, (Date.now() - new Date(p.created_at).getTime()) / 3600000)
      return {
        poll: p,
        trending: p.voteCount / ageHours,           // velocity
        newest: new Date(p.created_at).getTime(),   // higher = newer
        top: p.voteCount,
      }
    })
    let sorted: typeof scored
    if (sortMode === 'new') sorted = [...scored].sort((a, b) => b.newest - a.newest)
    else if (sortMode === 'top') sorted = [...scored].sort((a, b) => b.top - a.top)
    else sorted = [...scored].sort((a, b) => b.trending - a.trending)
    return sorted.slice(0, MAX_PLANETS).map(s => s.poll)
  }, [polls, sortMode])

  const planets = useMemo(() => {
    const n = visiblePolls.length
    if (n === 0) return []

    // Large planet radii — fill the screen like the reference design
    const minR = vw < 480 ? 90  : vw < 768 ? 115 : 140
    const maxR = vw < 480 ? 135 : vw < 768 ? 170 : 210
    const radii = visiblePolls.map(p =>
      Math.min(minR + Math.sqrt(p.voteCount) * 4, maxR)
    )

    // Hero text ends roughly here — mobile needs more room (text wraps more + chips)
    const heroBottom = Math.max(72, vh * 0.10) + (vw < 480 ? 360 : 300)

    // Initial x: spread evenly across full width, outermost planets bleed off edges
    const positions: { x: number; y: number }[] = visiblePolls.map((poll, i) => {
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

    return visiblePolls.map((poll, i) => {
      const r = radii[i]
      const { colorA, colorB } = assignPalette(poll.id)
      const seed = det(poll.id, 99)
      const floatDur  = 2.8 + seed * 2.8   // 2.8s – 5.6s, each planet different
      const floatDelay = -(seed * floatDur)
      const amp = 15 + Math.round(seed * 13) // 15–28px — lively independent float

      return { poll, r, x: positions[i].x, y: positions[i].y, colorA, colorB, floatDur, floatDelay, amp }
    })
  }, [visiblePolls, vw, vh])

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
    const heroBottom = Math.max(72, vh * 0.10) + (vw < 480 ? 360 : 300)
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
  const trendingId = useMemo(() => trendingPollId(polls), [polls])
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
    // Haptic feedback — subtle tap (supported on mobile)
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(20)
    }
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
      return <>{parts[0]}<em style={{
        fontStyle: 'italic',
        background: day
          ? 'linear-gradient(135deg, #ff9100, #ff5252)'
          : 'linear-gradient(135deg, #b69aff, #66d4ff)',
        WebkitBackgroundClip: 'text', backgroundClip: 'text',
        WebkitTextFillColor: 'transparent', color: 'transparent',
      }}>{theWord}</em>{parts[1]}</>
    }
    return template
  }

  return (
    <div style={{ width: '100vw', height: '100dvh', overflow: 'hidden', position: 'relative', background: bgGradient }}>

      {/* Atmospheric depth: nebula clouds drift in the background */}
      <Nebula vw={vw} vh={vh} day={day} />

      {!day && <Stars vw={vw} vh={vh} />}

      {/* Pull-to-refresh indicator */}
      {(pullDist > 0 || refreshing) && (
        <div style={{
          position: 'fixed', top: pullDist - 30, left: '50%',
          transform: 'translateX(-50%)', zIndex: 150,
          width: 36, height: 36, borderRadius: '50%',
          background: day ? 'rgba(255,255,255,0.85)' : 'rgba(20,20,35,0.85)',
          border: `1px solid ${day ? 'rgba(42,26,94,0.15)' : 'rgba(245,240,232,0.15)'}`,
          backdropFilter: 'blur(12px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: textColor, fontSize: 16,
          boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
          transition: refreshing ? 'top 0.25s ease' : 'none',
        }}>
          <span style={{
            display: 'inline-block',
            animation: refreshing ? 'planetFloat 0.8s linear infinite' : 'none',
            transform: refreshing ? 'none' : `rotate(${pullDist * 3}deg)`,
            transition: refreshing ? 'none' : 'transform 0.05s linear',
          }}>↓</span>
        </div>
      )}

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

          {/* Sort filter chips */}
          {polls.length > 0 && (
            <div style={{
              display: 'flex', gap: 8, marginTop: 14,
              pointerEvents: 'auto', flexWrap: 'wrap', justifyContent: 'center',
            }}>
              {([
                { id: 'trending', icon: '🔥', label: 'Trending' },
                { id: 'new', icon: '✨', label: 'New' },
                { id: 'top', icon: '📊', label: 'Top' },
              ] as const).map(opt => {
                const active = sortMode === opt.id
                return (
                  <button key={opt.id} onClick={() => setSortMode(opt.id)} style={{
                    background: active
                      ? (day ? 'rgba(42,26,94,0.9)' : 'rgba(245,240,232,0.15)')
                      : 'transparent',
                    color: active ? (day ? '#fff' : textColor) : subColor,
                    border: `1px solid ${
                      active
                        ? (day ? 'transparent' : 'rgba(245,240,232,0.3)')
                        : (day ? 'rgba(42,26,94,0.18)' : 'rgba(245,240,232,0.18)')
                    }`,
                    borderRadius: 100, padding: '7px 14px',
                    fontSize: 12, fontWeight: active ? 700 : 500,
                    cursor: 'pointer', fontFamily: 'inherit',
                    display: 'flex', alignItems: 'center', gap: 5,
                    transition: 'all 0.18s ease',
                  }}>
                    <span style={{ fontSize: 13 }}>{opt.icon}</span>
                    {opt.label}
                  </button>
                )
              })}
            </div>
          )}

          {/* Browse all polls — always available when there's anything to browse */}
          {polls.length > 0 && (
            <button
              onClick={() => setBrowseOpen(true)}
              style={{
                marginTop: 10, pointerEvents: 'auto',
                background: 'none', border: 'none',
                color: subColor, fontSize: 12, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit',
                padding: '4px 8px',
                display: 'flex', alignItems: 'center', gap: 6,
                textDecoration: 'underline', textDecorationStyle: 'dotted',
                textUnderlineOffset: 4, opacity: 0.85,
              }}
            >
              {polls.length > MAX_PLANETS
                ? `Browse all ${polls.length} polls`
                : `Search & browse polls`}
              <span style={{ fontSize: 13 }}>→</span>
            </button>
          )}
        </div>
      )}

      {loading && (
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          {/* Skeleton planets — pulsing ghost circles in the same area */}
          {[0, 1, 2, 3].map(i => {
            const size = 120 + (i % 2) * 50
            const x = 12 + i * 22 + (i % 2) * 4
            const y = 52 + (i % 2) * 12
            return (
              <div key={i} style={{
                position: 'absolute',
                left: `${x}%`, top: `${y}%`,
                width: size, height: size, borderRadius: '50%',
                transform: 'translate(-50%, -50%)',
                background: day ? 'rgba(42,26,94,0.07)' : 'rgba(245,240,232,0.05)',
                animation: `cosmosTwinkle 1.8s ease-in-out ${i * 0.15}s infinite`,
              }} />
            )
          })}
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: 10, color: subColor, fontSize: 13, opacity: 0.7,
          }}>
            Aligning the planets…
          </div>
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
            {channel && channel !== 'global' ? 'Quiet in here' : 'The cosmos is empty'}
          </p>
          <p style={{ margin: 0, color: subColor, fontSize: 14, maxWidth: 320, lineHeight: 1.55 }}>
            {channel && channel !== 'global'
              ? `No polls yet in ${getChannel(channel).name}. Switch to Global to see all polls, or be the first to ask.`
              : 'No polls yet. Be the first to ask the world something.'}
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center', marginTop: 4 }}>
            {channel && channel !== 'global' && (
              <button onClick={() => handleChannelSelect('global')} style={{
                background: 'transparent',
                color: textColor,
                border: `1px solid ${day ? 'rgba(42,26,94,0.25)' : 'rgba(245,240,232,0.25)'}`,
                borderRadius: 100, padding: '12px 24px', fontSize: 14,
                fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
              }}>
                🌍 Switch to Global
              </button>
            )}
            <button onClick={() => router.push('/create')} style={{
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
        </div>
      )}

      {/* Planet cluster */}
      {!loading && polls.length > 0 && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 5,
          transform: `translate3d(${mouse.x * 18}px, ${mouse.y * 10}px, 0)`,
          transition: 'transform 0.4s cubic-bezier(0.2,0.8,0.2,1)',
        }}>
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
                {poll.created_at && (Date.now() - new Date(poll.created_at).getTime()) < 86400000 && trendingId !== poll.id && (
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
                {/* TRENDING badge — highest vote velocity, takes priority over NEW */}
                {trendingId === poll.id && (
                  <div style={{
                    position: 'absolute', top: 8, right: 8, zIndex: 2,
                    background: 'linear-gradient(135deg, #f59e0b, #ef4444)',
                    color: '#fff', fontSize: 10, fontWeight: 800,
                    letterSpacing: '0.08em', padding: '4px 10px',
                    borderRadius: 100, boxShadow: '0 4px 14px rgba(245,158,11,0.5)',
                    pointerEvents: 'none',
                    display: 'flex', alignItems: 'center', gap: 4,
                  }}>
                    🔥 TRENDING
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
                    boxShadow: `0 0 70px ${colorA}33, 0 0 120px ${colorB}22, 0 8px 32px ${colorA}66, inset 0 -10px 24px rgba(0,0,0,0.18)`,
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
                  boxShadow: `0 0 120px ${modal.colorA}55, 0 24px 80px ${modal.colorA}88, inset 0 -16px 40px rgba(0,0,0,0.25)`,
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

      {/* Browse all overlay */}
      {browseOpen && (() => {
        const q = browseSearch.trim().toLowerCase()
        const filtered = polls.filter(p => {
          if (!q) return true
          return p.question.toLowerCase().includes(q)
            || p.option_1.toLowerCase().includes(q)
            || p.option_2.toLowerCase().includes(q)
        })
        const scored = filtered.map(p => {
          const ageHours = Math.max(0.5, (Date.now() - new Date(p.created_at).getTime()) / 3600000)
          return {
            poll: p,
            trending: p.voteCount / ageHours,
            newest: new Date(p.created_at).getTime(),
            top: p.voteCount,
          }
        })
        const sorted = (sortMode === 'new'
          ? [...scored].sort((a, b) => b.newest - a.newest)
          : sortMode === 'top'
          ? [...scored].sort((a, b) => b.top - a.top)
          : [...scored].sort((a, b) => b.trending - a.trending)
        ).map(s => s.poll)

        const panelBg = day
          ? 'linear-gradient(180deg, rgba(255,255,255,0.97) 0%, rgba(248,244,255,0.97) 100%)'
          : 'linear-gradient(180deg, rgba(15,12,35,0.97) 0%, rgba(20,15,50,0.97) 100%)'
        const borderC = day ? 'rgba(42,26,94,0.1)' : 'rgba(245,240,232,0.1)'
        const itemBg = day ? 'rgba(42,26,94,0.05)' : 'rgba(255,255,255,0.05)'

        return (
          <div
            onClick={() => setBrowseOpen(false)}
            style={{
              position: 'fixed', inset: 0, zIndex: 220,
              background: 'rgba(0,0,0,0.5)',
              backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
              display: 'flex', justifyContent: 'center', alignItems: 'flex-end',
              animation: 'cosmosFadeUp 0.25s ease forwards',
            }}
          >
            <div
              onClick={e => e.stopPropagation()}
              style={{
                width: '100%', maxWidth: 560, height: '92vh', maxHeight: 760,
                background: panelBg, borderRadius: '24px 24px 0 0',
                border: `1px solid ${borderC}`,
                backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
                display: 'flex', flexDirection: 'column',
                boxShadow: '0 -16px 60px rgba(0,0,0,0.4)',
              }}
            >
              {/* Header */}
              <div style={{ padding: '20px 20px 12px', borderBottom: `1px solid ${borderC}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <h2 style={{
                    margin: 0, fontSize: 22, fontWeight: 700,
                    color: textColor, fontFamily: serif,
                  }}>
                    All polls
                  </h2>
                  <button
                    onClick={() => setBrowseOpen(false)}
                    aria-label="Close"
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: subColor, fontSize: 24, padding: 0,
                      width: 32, height: 32, display: 'flex',
                      alignItems: 'center', justifyContent: 'center',
                    }}
                  >×</button>
                </div>
                {/* Search */}
                <div style={{ position: 'relative' }}>
                  <span style={{
                    position: 'absolute', left: 14, top: '50%',
                    transform: 'translateY(-50%)', fontSize: 14, opacity: 0.5,
                  }}>🔍</span>
                  <input
                    type="text" value={browseSearch}
                    onChange={e => setBrowseSearch(e.target.value)}
                    placeholder="Search questions…"
                    style={{
                      width: '100%', padding: '11px 14px 11px 38px',
                      borderRadius: 12, fontSize: 14,
                      border: `1px solid ${borderC}`,
                      background: itemBg, color: textColor,
                      outline: 'none', fontFamily: 'inherit',
                    }}
                  />
                </div>
                {/* Sort chips in overlay */}
                <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
                  {([
                    { id: 'trending', icon: '🔥', label: 'Trending' },
                    { id: 'new', icon: '✨', label: 'New' },
                    { id: 'top', icon: '📊', label: 'Top' },
                  ] as const).map(opt => {
                    const active = sortMode === opt.id
                    return (
                      <button key={opt.id} onClick={() => setSortMode(opt.id)} style={{
                        background: active
                          ? (day ? 'rgba(42,26,94,0.9)' : 'rgba(245,240,232,0.18)')
                          : 'transparent',
                        color: active ? (day ? '#fff' : textColor) : subColor,
                        border: `1px solid ${
                          active
                            ? (day ? 'transparent' : 'rgba(245,240,232,0.3)')
                            : borderC
                        }`,
                        borderRadius: 100, padding: '6px 12px',
                        fontSize: 11, fontWeight: active ? 700 : 500,
                        cursor: 'pointer', fontFamily: 'inherit',
                        display: 'flex', alignItems: 'center', gap: 4,
                      }}>
                        <span>{opt.icon}</span>{opt.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Scrollable list */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '12px 12px 24px' }}>
                {sorted.length === 0 ? (
                  <p style={{ textAlign: 'center', padding: '40px 20px', color: subColor, fontSize: 14 }}>
                    {q ? `No polls match "${browseSearch}"` : 'No polls yet.'}
                  </p>
                ) : (
                  sorted.map(poll => {
                    const { colorA, colorB } = assignPalette(poll.id)
                    const isNew = poll.created_at && (Date.now() - new Date(poll.created_at).getTime()) < 86400000
                    const isTrending = trendingId === poll.id
                    return (
                      <button
                        key={poll.id}
                        onClick={() => {
                          setBrowseOpen(false)
                          openModal(poll, colorA, colorB)
                        }}
                        style={{
                          width: '100%', textAlign: 'left',
                          background: 'transparent', border: 'none',
                          padding: '14px 12px', borderRadius: 14,
                          cursor: 'pointer', fontFamily: 'inherit',
                          display: 'flex', alignItems: 'flex-start', gap: 12,
                          transition: 'background 0.15s',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = itemBg)}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      >
                        {/* Color swatch */}
                        <div style={{
                          flexShrink: 0, width: 36, height: 36, borderRadius: '50%',
                          background: `radial-gradient(circle at 35% 30%, ${colorA}, ${colorB})`,
                          boxShadow: `0 4px 12px ${colorA}55`,
                          marginTop: 2,
                        }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 14, fontWeight: 600, color: textColor, lineHeight: 1.35 }}>
                              {poll.question}
                            </span>
                            {isTrending && (
                              <span style={{
                                fontSize: 9, fontWeight: 800, letterSpacing: '0.08em',
                                padding: '2px 7px', borderRadius: 100, color: '#fff',
                                background: 'linear-gradient(135deg, #f59e0b, #ef4444)',
                              }}>🔥 TRENDING</span>
                            )}
                            {!isTrending && isNew && (
                              <span style={{
                                fontSize: 9, fontWeight: 800, letterSpacing: '0.08em',
                                padding: '2px 7px', borderRadius: 100, color: '#fff',
                                background: 'linear-gradient(135deg, #ff5252, #ff9100)',
                              }}>NEW</span>
                            )}
                          </div>
                          <p style={{ margin: 0, fontSize: 12, color: subColor, lineHeight: 1.4 }}>
                            {poll.option_1} <span style={{ opacity: 0.5 }}>vs</span> {poll.option_2} · {formatVotes(poll.voteCount)} {poll.voteCount === 1 ? 'vote' : 'votes'}
                          </p>
                        </div>
                      </button>
                    )
                  })
                )}
              </div>
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

function Nebula({ vw, vh, day }: { vw: number; vh: number; day: boolean }) {
  const clouds = useMemo(() => {
    const rng = mulberry32(day ? 731 : 142)
    return Array.from({ length: 6 }, (_, i) => {
      const hue = day
        ? 25 + rng() * 30   // warm pastels: amber→peach
        : 250 + rng() * 80  // violet→magenta→blue
      const sat = day ? 70 : 75
      const light = day ? 78 : 50
      const alpha = day ? 0.18 : 0.28
      return {
        id: i,
        x: rng() * vw,
        y: rng() * vh * 0.75,
        size: 280 + rng() * 460,
        color: `hsla(${hue}, ${sat}%, ${light}%, ${alpha})`,
        duration: 70 + rng() * 80,
        delay: -rng() * 80,
        scale: 0.85 + rng() * 0.3,
      }
    })
  }, [vw, vh, day])

  return (
    <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
      {clouds.map(c => (
        <div key={c.id} style={{
          position: 'absolute',
          left: c.x - c.size / 2, top: c.y - c.size / 2,
          width: c.size, height: c.size, borderRadius: '50%',
          background: `radial-gradient(circle at 50% 50%, ${c.color} 0%, transparent 65%)`,
          filter: 'blur(36px)',
          ['--s' as string]: String(c.scale),
          animation: `cosmosCloudDrift ${c.duration}s linear ${c.delay}s infinite`,
          willChange: 'transform',
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
