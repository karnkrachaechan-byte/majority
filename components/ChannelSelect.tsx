'use client'

import { CHANNELS, Channel } from '@/lib/channels'

interface Props {
  suggested: string
  day: boolean
  onSelect: (channelId: string) => void
}

export function ChannelSelect({ suggested, day, onSelect }: Props) {
  const serif     = '"Cormorant Garamond", Georgia, "Times New Roman", serif'
  const textColor = day ? '#2a1a5e' : '#f5f0e8'
  const subColor  = day ? '#7a6a9e' : '#b0a8cc'
  const cardBg    = day ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.07)'
  const cardHover = day ? 'rgba(255,255,255,0.38)' : 'rgba(255,255,255,0.14)'
  const borderColor = day ? 'rgba(42,26,94,0.15)' : 'rgba(245,240,232,0.15)'
  const suggestedBorder = day ? 'rgba(42,26,94,0.5)' : 'rgba(245,240,232,0.5)'

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 300,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '40px 24px',
      background: day ? 'rgba(214,210,235,0.55)' : 'rgba(10,14,31,0.7)',
      backdropFilter: 'blur(16px)',
      overflowY: 'auto',
    }}>
      <div style={{ maxWidth: 640, width: '100%', textAlign: 'center' }}>

        <p style={{ fontSize: 13, fontWeight: 600, color: subColor, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 12 }}>
          Welcome to Majority
        </p>
        <h1 style={{
          fontSize: 'clamp(32px, 6vw, 52px)', fontWeight: 700,
          color: textColor, fontFamily: serif, lineHeight: 1.1, marginBottom: 10,
        }}>
          Pick your world
        </h1>
        <p style={{ fontSize: 15, color: subColor, marginBottom: 36, lineHeight: 1.6 }}>
          Choose a channel to see polls in your language.{' '}
          {suggested !== 'global' && (
            <span>We detected your region — it&apos;s highlighted below.</span>
          )}
        </p>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
          gap: 12,
          marginBottom: 32,
        }}>
          {CHANNELS.map((ch: Channel) => {
            const isSuggested = ch.id === suggested
            return (
              <button
                key={ch.id}
                onClick={() => onSelect(ch.id)}
                style={{
                  background: cardBg,
                  border: `1.5px solid ${isSuggested ? suggestedBorder : borderColor}`,
                  borderRadius: 20,
                  padding: '20px 16px',
                  cursor: 'pointer',
                  textAlign: 'center',
                  fontFamily: 'inherit',
                  transition: 'background 0.2s, transform 0.2s',
                  transform: isSuggested ? 'scale(1.04)' : 'scale(1)',
                  position: 'relative',
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLElement).style.background = cardHover
                  ;(e.currentTarget as HTMLElement).style.transform = 'scale(1.06)'
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLElement).style.background = cardBg
                  ;(e.currentTarget as HTMLElement).style.transform = isSuggested ? 'scale(1.04)' : 'scale(1)'
                }}
              >
                {isSuggested && (
                  <span style={{
                    position: 'absolute', top: -10, left: '50%', transform: 'translateX(-50%)',
                    fontSize: 10, fontWeight: 700, background: textColor, color: day ? '#fff' : '#1a0e3a',
                    padding: '2px 10px', borderRadius: 100, letterSpacing: '0.06em', textTransform: 'uppercase',
                  }}>
                    Your region
                  </span>
                )}
                <div style={{ fontSize: 32, marginBottom: 8 }}>{ch.flag}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: textColor, marginBottom: 4 }}>{ch.name}</div>
                <div style={{ fontSize: 12, color: subColor }}>{ch.language}</div>
              </button>
            )
          })}
        </div>

        <p style={{ fontSize: 12, color: subColor }}>
          You can change this anytime from the header.
        </p>
      </div>
    </div>
  )
}
