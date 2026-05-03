'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useDayNight } from '@/components/cosmos/useDayNight'
import { useViewport } from '@/components/cosmos/useOrbit'

interface PollData {
  id: string
  question: string
  option_1: string
  option_2: string
  voteCount: number
  totals: { a: number; b: number; total: number }
}

function formatVotes(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

function textOnColor(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return lum > 0.58 ? 'rgba(25,15,55,0.9)' : '#fff'
}

function det(id: string, salt: number): number {
  let h = 2166136261 ^ salt
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619) }
  return ((h >>> 0) % 10000) / 10000
}

const NIGHT_COLORS = ['#7DD4A8','#56D0E8','#F4A261','#F5A0C5','#B8A8E8','#F8D675','#A8D8EA','#FFA8A8']
const DAY_COLORS   = ['#FF6B6B','#FF8E53','#FFC857','#A8E063','#56CCF2','#6C63FF','#F77FBE','#43E97B']

export default function Home() {
  const router = useRouter()
  const day = useDayNight()
  const { w: vw, h: vh } = useViewport()
  const [polls, setPolls] = useState<PollData[]>([])
  const [loading, setLoading] = useState(true)
  const [zoomingId, setZoomingId] = useState<string | null>(null)

  useEffect(() => {
    async function fetchPolls() {
      const { data: pollData } = await supabase
        .from('polls')
        .select('id, question, option_1, option_2, expires_at')
        .eq('is_active', true)
        .or('expires_at.is.null,expires_at.gt.' + new Date().toISOString())
        .order('created_at', { ascending: false })

      if (!pollData || pollData.length === 0) { setPolls([]); setLoading(false); return }

      const { data: voteData } = await supabase
        .from('votes').select('poll_id, choice')
        .in('poll_id', pollData.map(p => p.id))

      const totMap: Record<string, { a: number; b: number; total: number }> = {}
      voteData?.forEach(v => {
        const t = totMap[v.poll_id] ?? { a: 0, b: 0, total: 0 }
        if (v.choice === 1) t.a++; else if (v.choice === 2) t.b++
        t.total = t.a + t.b; totMap[v.poll_id] = t
      })

      setPolls(pollData.map(p => ({
        ...p,
        voteCount: totMap[p.id]?.total ?? 0,
        totals: totMap[p.id] ?? { a: 0, b: 0, total: 0 },
      })).sort((a, b) => b.voteCount - a.voteCount))
      setLoading(false)
    }
    fetchPolls()
  }, [])

  const planets = useMemo(() => {
    const cx = vw * 0.44
    const cy = vh * 0.82
    const maxR = Math.min(vw * 0.09, 110)   // capped — never fills the screen
    const minR = Math.min(vw * 0.05, 58)
    const golden = 2.399

    return polls.map((poll, i) => {
      const r = maxR - (i / Math.max(polls.length - 1, 1)) * (maxR - minR)
      const angle = i === 0 ? 0 : i * golden + Math.PI * 0.25
      const spread = i === 0 ? 0 : 120 + i * 56
      const x = cx + Math.cos(angle) * spread + (det(poll.id, 20) - 0.5) * 36
      const y = cy + Math.sin(angle) * spread * 0.45 + (det(poll.id, 21) - 0.5) * 22
      const palette = day ? DAY_COLORS : NIGHT_COLORS
      const color = palette[Math.floor(det(poll.id, 22) * palette.length)]
      const floatDur = 4 + det(poll.id, 23) * 3
      const floatDelay = -det(poll.id, 24) * 5
      return { poll, r, x, y, color, floatDur, floatDelay }
    })
  }, [polls, vw, vh, day])

  // ASK planet: place it offset from last real planet
  const askPos = useMemo(() => {
    if (planets.length === 0) return { x: vw * 0.72, y: vh * 0.68 }
    const last = planets[planets.length - 1]
    return { x: last.x + last.r + 90, y: last.y - 20 }
  }, [planets, vw, vh])

  const totalVotes = polls.reduce((s, p) => s + p.voteCount, 0)

  function handleClick(id: string) {
    if (zoomingId) return
    setZoomingId(id)
    setTimeout(() => router.push(`/poll/${id}`), 600)
  }

  const serif = '"Cormorant Garamond", Georgia, "Times New Roman", serif'
  const textColor = day ? '#2a1a5e' : '#f5f0e8'
  const subColor  = day ? '#7a6a9e' : '#b0a8cc'
  const bgGradient = day
    ? 'linear-gradient(160deg, #d6e9f5 0%, #f3e5d0 60%, #ffd9b8 100%)'
    : 'linear-gradient(160deg, #1a0e3a 0%, #2d1b5e 45%, #1e1040 100%)'

  return (
    <div style={{ width: '100vw', height: '100dvh', overflow: 'hidden', position: 'relative', background: bgGradient }}>

      {/* Night stars */}
      {!day && <Stars vw={vw} vh={vh} />}

      {/* Moon / Sun */}
      <div style={{
        position: 'absolute', top: '7%', right: '7%',
        width: day ? 140 : 120, height: day ? 140 : 120,
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
        padding: '20px 28px', pointerEvents: 'none',
      }}>
        <div style={{ pointerEvents: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 20, color: textColor, opacity: 0.8, lineHeight: 1 }}>⊙</span>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: textColor, margin: 0, fontFamily: serif }}>Majority</h1>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', pointerEvents: 'auto' }}>
          <a href="/dashboard/request" style={{
            color: textColor, fontSize: 13, fontWeight: 500, textDecoration: 'none',
            padding: '9px 18px', borderRadius: 100,
            border: `1px solid ${day ? 'rgba(42,26,94,0.2)' : 'rgba(245,240,232,0.2)'}`,
          }}>
            My polls
          </a>
          <a href="/create" style={{
            background: day ? 'rgba(42,26,94,0.85)' : 'rgba(245,240,232,0.12)',
            color: day ? '#fff' : textColor,
            border: `1px solid ${day ? 'transparent' : 'rgba(245,240,232,0.3)'}`,
            padding: '9px 22px', borderRadius: 100,
            fontSize: 13, fontWeight: 600, textDecoration: 'none',
          }}>
            + Ask the world
          </a>
        </div>
      </div>

      {/* Hero text */}
      {!loading && (
        <div style={{
          position: 'absolute', top: '13%', left: 0, right: 0,
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          gap: 12, padding: '0 24px', pointerEvents: 'none', zIndex: 10,
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
            {day ? 'Daytime' : 'Nighttime'} · Live · {formatVotes(totalVotes)} voting now
          </div>

          <div style={{
            fontFamily: serif,
            fontSize: 'clamp(38px, 7.5vw, 92px)',
            fontWeight: 400, color: textColor,
            textAlign: 'center', lineHeight: 1.08,
            maxWidth: 700,
          }}>
            What does <em style={{ fontStyle: 'italic' }}>the world</em> think?
          </div>

          <p style={{
            fontSize: 'clamp(13px, 1.6vw, 15px)', color: subColor,
            textAlign: 'center', maxWidth: 400, lineHeight: 1.65, margin: 0,
          }}>
            Real answers, every age and gender. Cast your vote to see how the world answered.
          </p>
        </div>
      )}

      {loading && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: subColor, fontSize: 15 }}>
          Loading...
        </div>
      )}

      {!loading && polls.length === 0 && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: subColor, fontSize: 15, gap: 8 }}>
          <p style={{ margin: 0 }}>No polls yet.</p>
          <p style={{ margin: 0, fontSize: 13 }}>Be the first to create one!</p>
        </div>
      )}

      {/* Planet cluster */}
      {!loading && polls.length > 0 && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 5 }}>
          {planets.map(({ poll, r, x, y, color, floatDur, floatDelay }) => {
            const pctA = poll.totals.total > 0 ? Math.round(poll.totals.a / poll.totals.total * 100) : 50
            const pctB = 100 - pctA
            return (
              <button
                key={poll.id}
                onClick={() => handleClick(poll.id)}
                aria-label={poll.question}
                className={zoomingId === poll.id ? 'bubble-zoom' : ''}
                style={{
                  position: 'absolute',
                  left: x - r, top: y - r, width: r * 2, height: r * 2,
                  borderRadius: '50%', border: 'none', cursor: 'pointer',
                  background: color,
                  boxShadow: `0 12px 48px ${color}66, 0 4px 16px rgba(0,0,0,0.15)`,
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center',
                  textAlign: 'center', padding: '12%',
                  animation: zoomingId === poll.id ? undefined : `float ${floatDur}s ease-in-out ${floatDelay}s infinite`,
                  zIndex: zoomingId === poll.id ? 50 : 5,
                  transition: 'transform 0.3s ease, box-shadow 0.3s ease',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1.06)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)' }}
              >
                <span style={{
                  color: textOnColor(color), fontWeight: 700,
                  fontSize: r > 95 ? 16 : r > 70 ? 14 : 12,
                  lineHeight: 1.3, textShadow: '0 1px 6px rgba(0,0,0,0.15)',
                  display: '-webkit-box', WebkitLineClamp: 3,
                  WebkitBoxOrient: 'vertical', overflow: 'hidden',
                  maxWidth: '80%',
                }}>
                  {poll.question}
                </span>
                {poll.voteCount > 0 && (
                  <span style={{ color: textOnColor(color), opacity: 0.7, fontSize: r > 80 ? 11 : 10, marginTop: 6, fontWeight: 600 }}>
                    {formatVotes(poll.voteCount)} · {pctA}/{pctB}
                  </span>
                )}
              </button>
            )
          })}

          {/* ASK planet */}
          <button
            onClick={() => router.push('/create')}
            aria-label="Ask the world a question"
            style={{
              position: 'absolute',
              left: askPos.x - 56, top: askPos.y - 56,
              width: 112, height: 112, borderRadius: '50%',
              border: `2px dashed ${day ? 'rgba(42,26,94,0.45)' : 'rgba(245,240,232,0.45)'}`,
              background: 'transparent', cursor: 'pointer',
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              animation: 'float 5.5s ease-in-out -1s infinite',
              transition: 'background 0.3s',
              zIndex: 5,
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = day ? 'rgba(42,26,94,0.06)' : 'rgba(255,255,255,0.07)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
          >
            <span style={{ color: day ? 'rgba(42,26,94,0.7)' : 'rgba(245,240,232,0.8)', fontSize: 26, fontWeight: 300, lineHeight: 1 }}>+</span>
            <span style={{ color: day ? 'rgba(42,26,94,0.6)' : 'rgba(245,240,232,0.7)', fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginTop: 4 }}>ASK</span>
            <span style={{ color: day ? 'rgba(42,26,94,0.5)' : 'rgba(245,240,232,0.6)', fontSize: 9, fontWeight: 400, marginTop: 1 }}>your own</span>
          </button>
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
            {polls.length} {polls.length === 1 ? 'poll' : 'polls'} in orbit · {formatVotes(totalVotes)} voices · No login required
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
      x: rng2() * vw * 0.5, // start from left half
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
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
