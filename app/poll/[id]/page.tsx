// app/poll/[id]/page.tsx
//
// Cosmos voting page. Two giant planets — option_1 vs option_2 — live in
// the same orbit sky as the home page. Vote → demographic form → results
// stage with radial breakdowns. State machine and API calls match the
// original poll page byte-for-byte; only the visual layer is new.

'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import FingerprintJS from '@fingerprintjs/fingerprintjs';
import { supabase } from '@/lib/supabase';
import { assignPalette } from '@/lib/theme';
import { useDayNight } from '@/components/cosmos/useDayNight';
import { useViewport, useOrbit, useMouseParallax } from '@/components/cosmos/useOrbit';
import { DaySky } from '@/components/cosmos/DaySky';
import { NightSky } from '@/components/cosmos/NightSky';
import { DemographicRings } from '@/components/cosmos/DemographicRings';

interface Poll {
  id: string;
  question: string;
  option_1: string;
  option_2: string;
  expires_at: string | null;
}

interface DemoBreakdown {
  male: { 1: number; 2: number };
  female: { 1: number; 2: number };
  prefer_not_to_say: { 1: number; 2: number };
}

type AgeBreakdown = Record<string, { 1: number; 2: number }>;

const AGE_GROUPS = [
  { label: 'Under 18', min: 0, max: 17 },
  { label: '18–24', min: 18, max: 24 },
  { label: '25–34', min: 25, max: 34 },
  { label: '35–44', min: 35, max: 44 },
  { label: '45+', min: 45, max: 999 },
];

type Stage = 'voting' | 'demographic' | 'results';

export default function PollPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const day = useDayNight();
  const t = useOrbit();
  const mouse = useMouseParallax();
  const { w: vw, h: vh } = useViewport();

  const [poll, setPoll] = useState<Poll | null>(null);
  const [loading, setLoading] = useState(true);
  const [stage, setStage] = useState<Stage>('voting');
  const [selectedChoice, setSelectedChoice] = useState<1 | 2 | null>(null);
  const [voteCounts, setVoteCounts] = useState<{ 1: number; 2: number }>({ 1: 0, 2: 0 });
  const [demographics, setDemographics] = useState<DemoBreakdown | null>(null);
  const [ageBreakdown, setAgeBreakdown] = useState<AgeBreakdown | null>(null);
  const [fingerprint, setFingerprint] = useState('');
  const [canChange, setCanChange] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [zoomingChoice, setZoomingChoice] = useState<1 | 2 | null>(null);
  const [copied, setCopied] = useState(false);

  // demographic form
  const [age, setAge] = useState('');
  const [gender, setGender] = useState('');
  const [demoError, setDemoError] = useState('');
  const [demoSubmitting, setDemoSubmitting] = useState(false);

  const palette = id ? assignPalette(id) : assignPalette('default');
  const { colorA, colorB } = palette;

  const fetchVoteData = useCallback(async () => {
    const { data } = await supabase
      .from('votes')
      .select('choice, voter_gender, voter_age')
      .eq('poll_id', id);

    const counts = { 1: 0, 2: 0 };
    const demo: DemoBreakdown = {
      male: { 1: 0, 2: 0 },
      female: { 1: 0, 2: 0 },
      prefer_not_to_say: { 1: 0, 2: 0 },
    };
    const ageBrk: AgeBreakdown = {};
    AGE_GROUPS.forEach((g) => { ageBrk[g.label] = { 1: 0, 2: 0 }; });

    data?.forEach((v) => {
      if (v.choice === 1) counts[1]++;
      if (v.choice === 2) counts[2]++;
      if (v.voter_gender) {
        const g = v.voter_gender as keyof DemoBreakdown;
        if (demo[g]) demo[g][v.choice as 1 | 2]++;
      }
      if (v.voter_age) {
        const group = AGE_GROUPS.find((g) => v.voter_age >= g.min && v.voter_age <= g.max);
        if (group) ageBrk[group.label][v.choice as 1 | 2]++;
      }
    });

    setVoteCounts(counts);
    setDemographics(demo);
    setAgeBreakdown(ageBrk);
  }, [id]);

  useEffect(() => {
    async function init() {
      const fp = await FingerprintJS.load();
      const result = await fp.get();
      const fpId = result.visitorId;
      setFingerprint(fpId);

      const { data: pollData } = await supabase
        .from('polls').select('*').eq('id', id).single();
      setPoll(pollData);

      const res = await fetch(`/api/check-vote?poll_id=${id}&fingerprint=${fpId}`);
      const voteData = await res.json();

      if (voteData.vote) {
        setSelectedChoice(voteData.vote.choice);
        setCanChange(new Date() < new Date(voteData.vote.can_change_until));
        await fetchVoteData();
        setStage(voteData.vote.voter_age == null ? 'demographic' : 'results');
      }
      setLoading(false);
    }
    init();
  }, [id, fetchVoteData]);

  async function handleVote(choice: 1 | 2) {
    if (submitting || zoomingChoice) return;
    setZoomingChoice(choice);
    setTimeout(async () => {
      setSubmitting(true);
      setError('');
      try {
        const res = await fetch('/api/vote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ poll_id: id, choice, fingerprint }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to vote');
        setSelectedChoice(choice);
        await fetchVoteData();
        setStage('demographic');
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to vote');
        setStage('voting');
      } finally {
        setSubmitting(false);
        setZoomingChoice(null);
      }
    }, 600);
  }

  async function handleChangeVote(choice: 1 | 2) {
    if (!canChange || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/vote', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ poll_id: id, choice, fingerprint }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSelectedChoice(choice);
      await fetchVoteData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to change vote');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDemoSubmit() {
    if (!age || parseInt(age) < 1 || parseInt(age) > 120) {
      setDemoError('Please enter a valid age.'); return;
    }
    if (!gender) { setDemoError('Please select your gender.'); return; }
    setDemoError('');
    setDemoSubmitting(true);
    await fetch('/api/update-demographic', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ poll_id: id, fingerprint, age: parseInt(age), gender }),
    });
    await fetchVoteData();
    setDemoSubmitting(false);
    setStage('results');
  }

  async function handleReport() {
    await fetch('/api/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ poll_id: id }),
    });
    alert('Thank you for reporting. We will review this poll.');
  }

  function handleShare() {
    const url = window.location.href;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function voteWord(n: number) { return `${n} ${n === 1 ? 'vote' : 'votes'}`; }

  const total = voteCounts[1] + voteCounts[2];
  const pct1 = total > 0 ? Math.round((voteCounts[1] / total) * 100) : 50;
  const pct2 = total > 0 ? Math.round((voteCounts[2] / total) * 100) : 50;

  const textColor = day ? '#1a1a2e' : '#f0f0f8';
  const subColor = day ? '#5a5a6e' : '#9a9aae';
  const cardBg = day ? 'rgba(255,255,255,0.85)' : 'rgba(20,20,30,0.7)';
  const borderColor = day ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)';

  if (loading) return (
    <div className="cosmos-stage" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {day ? <DaySky w={vw} h={vh} /> : <NightSky w={vw} h={vh} />}
      <p style={{ color: subColor, position: 'relative' }}>Loading...</p>
    </div>
  );

  if (!poll) return (
    <div className="cosmos-stage" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
      {day ? <DaySky w={vw} h={vh} /> : <NightSky w={vw} h={vh} />}
      <p style={{ color: subColor, position: 'relative' }}>Poll not found.</p>
      <a href="/" style={{ color: subColor, fontSize: 14, position: 'relative' }}>← Back</a>
    </div>
  );

  const isExpired = poll.expires_at ? new Date() > new Date(poll.expires_at) : false;
  if (isExpired && stage === 'voting') return (
    <div className="cosmos-stage" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
      {day ? <DaySky w={vw} h={vh} /> : <NightSky w={vw} h={vh} />}
      <p style={{ fontSize: 20, fontWeight: 700, color: textColor, position: 'relative' }}>This poll has closed</p>
      <p style={{ color: subColor, fontSize: 14, position: 'relative' }}>{poll.question}</p>
      <a href="/" style={{ color: subColor, fontSize: 14, marginTop: 8, position: 'relative' }}>← See other polls</a>
    </div>
  );

  // Two-planet layout — left/right of center, gentle bob
  const cx = vw / 2;
  const cy = vh * 0.55;
  const sep = Math.min(vw * 0.32, 240);
  const bob1 = Math.sin(t * 0.8) * 6;
  const bob2 = Math.sin(t * 0.8 + 1.6) * 6;
  const planetR = stage === 'results'
    ? Math.min(vw, vh) * 0.18
    : Math.min(vw, vh) * 0.16;

  return (
    <div className="cosmos-stage">
      {day ? <DaySky w={vw} h={vh} /> : <NightSky w={vw} h={vh} />}

      <button
        onClick={() => router.push('/')}
        style={{
          position: 'fixed', top: 24, left: 24, zIndex: 100,
          background: 'none', border: 'none', cursor: 'pointer',
          color: subColor, fontSize: 14, fontWeight: 500,
        }}
      >
        ← Back
      </button>

      {/* Question — centered, kept away from moon (top-right) */}
      <div
        className="cosmos-fade-up"
        style={{
          position: 'absolute', top: '12%',
          left: 0, right: 0,
          padding: '0 10%',
          textAlign: 'center', zIndex: 5,
        }}
      >
        <p style={{
          fontSize: 'clamp(20px, 3.5vw, 28px)', fontWeight: 700,
          color: textColor, lineHeight: 1.3, margin: 0,
        }}>
          {poll.question}
        </p>
        {stage === 'voting' && (
          <p style={{ fontSize: 13, color: subColor, marginTop: 12 }}>
            One vote per person · changeable within 10 min
          </p>
        )}
      </div>

      {/* The two planets */}
      {(stage === 'voting' || stage === 'results') && (
        <>
          {([1, 2] as const).map((choice) => {
            const isA = choice === 1;
            const color = isA ? colorA : colorB;
            const label = isA ? poll.option_1 : poll.option_2;
            const pct = isA ? pct1 : pct2;
            const votes = voteCounts[choice];
            const isSelected = selectedChoice === choice;
            const x = cx + (isA ? -sep : sep);
            const y = cy + (isA ? bob1 : bob2);
            const r = stage === 'results'
              ? planetR * (0.8 + (pct / 100) * 0.6)
              : planetR;
            const parallaxK = stage === 'results' ? 8 : 0;
            return (
              <button
                key={choice}
                onClick={() => stage === 'voting' ? handleVote(choice) : (canChange && handleChangeVote(choice))}
                aria-label={label}
                disabled={stage === 'results' && !canChange}
                className={zoomingChoice === choice ? 'vote-bubble-zoom' : 'cosmos-fade-up'}
                style={{
                  position: 'absolute',
                  left: x - r, top: y - r,
                  width: r * 2, height: r * 2,
                  borderRadius: '50%',
                  border: 'none', padding: 0,
                  cursor: (stage === 'voting' || canChange) ? 'pointer' : 'default',
                  background: 'transparent',
                  transform: parallaxK > 0 ? `translate3d(${mouse.x * parallaxK}px, ${mouse.y * parallaxK * 0.5}px, 0)` : undefined,
                  transition: 'width 0.8s ease, height 0.8s ease, left 0.8s ease, top 0.8s ease',
                  zIndex: 10,
                }}
              >
                {/* Glow */}
                <div style={{
                  position: 'absolute', inset: -16, borderRadius: '50%',
                  background: `radial-gradient(circle, ${color}66 0%, transparent 70%)`,
                  filter: 'blur(14px)', pointerEvents: 'none',
                }} />
                {/* Selected ring */}
                {isSelected && (
                  <div style={{
                    position: 'absolute', inset: -6, borderRadius: '50%',
                    border: `3px solid ${color}`, opacity: 0.7,
                    pointerEvents: 'none',
                  }} />
                )}
                {/* Body */}
                <div style={{
                  position: 'absolute', inset: 0, borderRadius: '50%',
                  background: `radial-gradient(circle at 35% 30%, ${color} 0%, ${shade(color, -0.2)} 100%)`,
                  boxShadow: 'inset 0 -14px 40px rgba(0,0,0,0.3)',
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center',
                  padding: '14%', textAlign: 'center',
                }}>
                  <span style={{
                    color: '#fff', fontWeight: 700,
                    fontSize: 'clamp(14px, 2.2vw, 18px)',
                    lineHeight: 1.3,
                    textShadow: '0 1px 4px rgba(0,0,0,0.35)',
                    maxWidth: '85%',
                  }}>
                    {isSelected && '✓ '}{label}
                  </span>
                  {stage === 'results' && (
                    <>
                      <span style={{
                        color: '#fff', fontWeight: 800,
                        fontSize: 'clamp(20px, 3vw, 28px)',
                        marginTop: 8,
                      }}>{pct}%</span>
                      <span style={{
                        color: 'rgba(255,255,255,0.8)', fontSize: 11, marginTop: 2,
                      }}>{voteWord(votes)}</span>
                    </>
                  )}
                </div>
              </button>
            );
          })}
        </>
      )}

      {/* Voting error */}
      {stage === 'voting' && error && (
        <p style={{
          position: 'absolute', bottom: 80, left: '50%',
          transform: 'translateX(-50%)', color: '#ef4444', fontSize: 14, zIndex: 20,
        }}>{error}</p>
      )}

      {/* DEMOGRAPHIC FORM */}
      {stage === 'demographic' && (
        <div
          className="cosmos-fade-up"
          style={{
            position: 'absolute', inset: 0, display: 'flex',
            alignItems: 'center', justifyContent: 'center', padding: 24, zIndex: 30,
            background: day ? 'rgba(248,248,246,0.5)' : 'rgba(10,14,31,0.5)',
            backdropFilter: 'blur(8px)',
          }}
        >
          <div style={{
            background: cardBg, border: `1px solid ${borderColor}`,
            borderRadius: 24, padding: '36px 32px', width: '100%',
            maxWidth: 400, backdropFilter: 'blur(12px)',
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

      {/* RESULTS — bottom panels */}
      {stage === 'results' && (
        <div
          className="cosmos-fade-up"
          style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            maxHeight: '45vh', overflowY: 'auto',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', gap: 16,
            padding: '20px 24px 32px', zIndex: 20,
          }}
        >
          <p style={{ fontSize: 13, color: subColor }}>{voteWord(total)} total</p>

          {canChange && (
            <p style={{ fontSize: 12, color: subColor, marginTop: -8 }}>
              Tap the other planet to change your vote
            </p>
          )}

          {demographics && total > 0 && (
            <DemographicRings
              title="By gender"
              rows={[
                { label: 'Male', a: demographics.male[1], b: demographics.male[2] },
                { label: 'Female', a: demographics.female[1], b: demographics.female[2] },
                { label: 'Prefer not to say', a: demographics.prefer_not_to_say[1], b: demographics.prefer_not_to_say[2] },
              ]}
              colorA={colorA} colorB={colorB}
              textColor={textColor} subColor={subColor}
              cardBg={cardBg} borderColor={borderColor}
            />
          )}

          {ageBreakdown && total > 0 && (
            <DemographicRings
              title="By age"
              rows={AGE_GROUPS.map((g) => ({
                label: g.label,
                a: ageBreakdown[g.label][1],
                b: ageBreakdown[g.label][2],
              }))}
              colorA={colorA} colorB={colorB}
              textColor={textColor} subColor={subColor}
              cardBg={cardBg} borderColor={borderColor}
            />
          )}

          <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
            <button
              onClick={handleShare}
              style={{
                background: day ? '#111' : '#f0f0f0',
                color: day ? '#fff' : '#111',
                border: 'none', borderRadius: 100,
                padding: '12px 28px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
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
              Report
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Darken/lighten a hex color by a fraction in [-1..1]. */
function shade(hex: string, amt: number): string {
  const c = hex.replace('#', '');
  const num = parseInt(c, 16);
  let r = (num >> 16) & 0xff;
  let g = (num >> 8) & 0xff;
  let b = num & 0xff;
  r = Math.max(0, Math.min(255, Math.round(r + 255 * amt)));
  g = Math.max(0, Math.min(255, Math.round(g + 255 * amt)));
  b = Math.max(0, Math.min(255, Math.round(b + 255 * amt)));
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}
