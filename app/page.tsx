'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { assignPalette } from '@/lib/theme'
import { useDayNight } from '@/components/cosmos/useDayNight'
import { useViewport } from '@/components/cosmos/useOrbit'
import { getChannel, CHANNELS } from '@/lib/channels'
import { t } from '@/lib/i18n'

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
  const [zoomingId, setZoomingId] = useState<string | null>(null)
  const [channel, setChannel] = useState<string | null>(null)
  const [showChannelDropdown, setShowChannelDropdown] = useState(false)

  // Load channel from localStorage or detect silently from IP
  useEffect(() => {
    const saved = localStorage.getItem('majority_channel')
    if (saved) {
      setChannel(saved)
    } else {
      fetch('/api/detect-channel')
        .then(r => r.json())
        .then(d => {
          const detected = d.channel || 'global'
          localStorage.setItem('majority_channel', detected)
          setChannel(detected)
        })
        .catch(() => {
          localStorage.setItem('majority_channel', 'global')
          setChannel('global')
        })
    }
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
        .select('id, question, option_1, option_2, expires_at')
        .eq('is_active', true)
        .eq('is_archived', false)
        .or('expires_at.is.null,expires_at.gt.' + new Date().toISOString())
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

  const planets = useMemo(() => {
    const cx = vw * 0.44
    const cy = vh * 0.82
    const maxR = Math.min(vw * 0.09, 110)
    const minR = Math.min(vw * 0.05, 58)
    const golden = 2.399

    return polls.map((poll, i) => {
      const r = maxR - (i / Math.max(polls.length - 1, 1)) * (maxR - minR)
      const angle = i * golden + Math.PI * 0.25
      const spread = i === 0 ? 40 : 120 + i * 56
      const x = cx + Math.cos(angle) * spread + (det(poll.id, 20) - 0.5) * 36
      const y = cy + Math.sin(angle) * spread * 0.45 + (det(poll.id, 21) - 0.5) * 22
      const { colorA, colorB } = assignPalette(poll.id)
      const floatDur = 4 + det(poll.id, 23) * 3
      const floatDelay = -det(poll.id, 24) * 5
      return { poll, r, x, y, colorA, colorB, floatDur, floatDelay }
    })
  }, [polls, vw, vh])

  // ASK planet continues the phyllotaxis spiral after all poll planets
  const askPos = useMemo(() => {
    const cx = vw * 0.44
    const cy = vh * 0.82
    const golden = 2.399
    const n = polls.length
    const angle = n * golden + Math.PI * 0.25
    const spread = n === 0 ? 200 : 120 + n * 56
    return {
      x: cx + Math.cos(angle) * spread,
      y: cy + Math.sin(angle) * spread * 0.45,
    }
  }, [polls.length, vw, vh])

  const totalVotes = polls.reduce((s, p) => s + p.voteCount, 0)
  const ch = channel || 'global'

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

  // Render headline with optional styled italic word
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
          <svg width="32" height="22" viewBox="0 0 32 22" fill="none" style={{ opacity: 0.9 }}>
            <ellipse cx="16" cy="11" rx="14" ry="5" stroke={textColor} strokeWidth="1.5" fill="none" opacity="0.5"
              style={{ clipPath: 'inset(50% 0 0 0)' }} />
            <circle cx="16" cy="11" r="8" fill={textColor} opacity="0.92" />
            <ellipse cx="16" cy="11" rx="14" ry="5" stroke={textColor} strokeWidth="1.5" fill="none" opacity="0.85"
              style={{ clipPath: 'inset(0 0 50% 0)' }} />
          </svg>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: textColor, margin: 0, fontFamily: serif }}>Majority</h1>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', pointerEvents: 'auto' }}>
          {/* Channel switcher */}
          {channel && (
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setShowChannelDropdown(v => !v)}
                style={{
                  background: 'none', cursor: 'pointer',
                  color: textColor, fontSize: 13, fontWeight: 500,
                  padding: '9px 14px', borderRadius: 100,
                  border: `1px solid ${day ? 'rgba(42,26,94,0.2)' : 'rgba(245,240,232,0.2)'}`,
                  display: 'flex', alignItems: 'center', gap: 6,
                  fontFamily: 'inherit',
                }}
              >
                <span style={{ fontSize: 16 }}>{getChannel(channel).flag}</span>
                <span>{getChannel(channel).name}</span>
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
                  {CHANNELS.map(ch => (
                    <button key={ch.id} onClick={() => { handleChannelSelect(ch.id); setShowChannelDropdown(false) }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        width: '100%', padding: '10px 12px', borderRadius: 10,
                        border: 'none', background: channel === ch.id
                          ? (day ? 'rgba(42,26,94,0.08)' : 'rgba(245,240,232,0.08)')
                          : 'transparent',
                        cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                      }}>
                      <span style={{ fontSize: 18 }}>{ch.flag}</span>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: textColor }}>{ch.name}</div>
                        <div style={{ fontSize: 11, color: day ? '#7a6a9e' : '#b0a8cc' }}>{ch.language}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <a href="/dashboard" style={{
            color: textColor, fontSize: 13, fontWeight: 500, textDecoration: 'none',
            padding: '9px 18px', borderRadius: 100,
            border: `1px solid ${day ? 'rgba(42,26,94,0.2)' : 'rgba(245,240,232,0.2)'}`,
          }}>
            {t(ch, 'nav.mypolls')}
          </a>
          <a href="/create" style={{
            background: day ? 'rgba(42,26,94,0.85)' : 'rgba(245,240,232,0.12)',
            color: day ? '#fff' : textColor,
            border: `1px solid ${day ? 'transparent' : 'rgba(245,240,232,0.3)'}`,
            padding: '9px 22px', borderRadius: 100,
            fontSize: 13, fontWeight: 600, textDecoration: 'none',
          }}>
            {t(ch, 'nav.ask')}
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
            {t(ch, day ? 'home.status.day' : 'home.status.night')} · {t(ch, 'home.status.live')} · {formatVotes(totalVotes)} {t(ch, 'home.status.voting')}
          </div>

          <div style={{
            fontFamily: serif,
            fontSize: 'clamp(38px, 7.5vw, 92px)',
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
          {planets.map(({ poll, r, x, y, colorA, colorB, floatDur, floatDelay }) => {
            const pctA = poll.totals.total > 0 ? Math.round(poll.totals.a / poll.totals.total * 100) : 50
            const pctB = 100 - pctA
            const gradient = `radial-gradient(circle at 38% 32%, ${colorA} 0%, ${colorB} 100%)`
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
                  background: gradient,
                  boxShadow: `0 12px 48px ${colorA}55, 0 4px 24px ${colorB}44`,
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
                  color: '#fff', fontWeight: 700,
                  fontSize: r > 95 ? 16 : r > 70 ? 14 : 12,
                  lineHeight: 1.3, textShadow: '0 1px 8px rgba(0,0,0,0.35)',
                  display: '-webkit-box', WebkitLineClamp: 3,
                  WebkitBoxOrient: 'vertical', overflow: 'hidden',
                  maxWidth: '80%',
                }}>
                  {poll.question}
                </span>
                {poll.voteCount > 0 && (
                  <span style={{ color: 'rgba(255,255,255,0.75)', fontSize: r > 80 ? 11 : 10, marginTop: 6, fontWeight: 600 }}>
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
            <span style={{ color: day ? 'rgba(42,26,94,0.6)' : 'rgba(245,240,232,0.7)', fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginTop: 4 }}>
              {t(ch, 'home.ask')}
            </span>
            <span style={{ color: day ? 'rgba(42,26,94,0.5)' : 'rgba(245,240,232,0.6)', fontSize: 9, fontWeight: 400, marginTop: 1 }}>
              {t(ch, 'home.ask.sub')}
            </span>
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
