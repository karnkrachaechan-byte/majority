'use client'

import { useRouter } from 'next/navigation'
import { useDayNight } from '@/components/cosmos/useDayNight'
import { useViewport } from '@/components/cosmos/useOrbit'
import { DaySky } from '@/components/cosmos/DaySky'
import { NightSky } from '@/components/cosmos/NightSky'

export default function PrivacyPage() {
  const router = useRouter()
  const day = useDayNight()
  const { w: vw, h: vh } = useViewport()

  const serif = '"Cormorant Garamond", Georgia, "Times New Roman", serif'
  const textColor   = day ? '#2a1a5e' : '#f5f0e8'
  const subColor    = day ? '#7a6a9e' : '#b0a8cc'
  const cardBg      = day ? 'rgba(255,255,255,0.75)' : 'rgba(15,12,35,0.72)'
  const borderColor = day ? 'rgba(42,26,94,0.12)' : 'rgba(245,240,232,0.12)'
  const divider     = day ? 'rgba(42,26,94,0.08)' : 'rgba(245,240,232,0.08)'

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div style={{ marginBottom: 28 }}>
      <p style={{ fontSize: 13, fontWeight: 700, color: subColor, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
        {title}
      </p>
      <div style={{ fontSize: 15, color: textColor, lineHeight: 1.75 }}>
        {children}
      </div>
    </div>
  )

  return (
    <div style={{ width: '100vw', height: '100dvh', position: 'relative', overflow: 'hidden' }}>
      {day ? <DaySky w={vw} h={vh} /> : <NightSky w={vw} h={vh} />}

      <div style={{
        position: 'absolute', inset: 0, overflowY: 'auto',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: '40px 24px 80px',
      }}>
        <div style={{ width: '100%', maxWidth: 620 }}>

          <button onClick={() => router.back()} style={{
            background: 'none', border: 'none', color: subColor,
            fontSize: 14, cursor: 'pointer', marginBottom: 28,
            display: 'block', fontFamily: 'inherit', padding: 0,
          }}>
            ← Back
          </button>

          <div style={{
            background: cardBg, backdropFilter: 'blur(20px)',
            border: `1px solid ${borderColor}`, borderRadius: 28,
            padding: '40px 36px',
          }}>
            <h1 style={{
              fontSize: 'clamp(28px, 5vw, 38px)', fontWeight: 700,
              color: textColor, marginBottom: 6, fontFamily: serif, lineHeight: 1.1,
            }}>
              Privacy Policy
            </h1>
            <p style={{ fontSize: 13, color: subColor, marginBottom: 36 }}>
              Last updated: May 2026
            </p>

            <div style={{ borderTop: `1px solid ${divider}`, paddingTop: 28 }}>

              <Section title="What is Majority?">
                Majority is a binary polling platform where anyone can cast a vote and see how the world answered — broken down by age, gender, and country.
              </Section>

              <Section title="What we collect from voters">
                When you vote, we collect:
                <ul style={{ marginTop: 10, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <li>Your <strong>age and gender</strong> — provided by you</li>
                  <li>Your <strong>country</strong> — detected automatically from your internet connection</li>
                  <li>Your <strong>vote choice</strong></li>
                </ul>
                <p style={{ marginTop: 12 }}>
                  We do <strong>not</strong> collect your name or email when you vote.
                </p>
              </Section>

              <Section title="What we collect from poll creators">
                If you create a poll, we also collect your <strong>email address</strong>. This is used solely to verify poll ownership and send you a verification link. Your email is never sold or shared with third parties.
              </Section>

              <Section title="How we use your data">
                <ul style={{ paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <li>To show demographic breakdowns on poll results</li>
                  <li>To prevent duplicate votes</li>
                  <li>Aggregated and anonymised voter data (age, gender, country, vote choice) may be shared with or sold to third-party researchers and businesses in the future</li>
                </ul>
              </Section>

              <Section title="What we never sell">
                Individual records tied to a real identity. Any commercial use of data is <strong>anonymised and aggregated only</strong> — meaning no one can trace a data point back to you personally.
              </Section>

              <Section title="Your rights">
                You may request deletion of your data at any time by emailing us. We will respond within 30 days.
              </Section>

              <Section title="Contact">
                <a href="mailto:karnkrachaechan@gmail.com" style={{ color: textColor, fontWeight: 600 }}>
                  karnkrachaechan@gmail.com
                </a>
              </Section>

            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
