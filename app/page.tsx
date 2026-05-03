'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { isDay, getBubbleColors, getRandomColor } from '@/lib/theme'

interface Poll {
  id: string
  question: string
  option_1: string
  option_2: string
  voteCount: number
}

interface BubbleData extends Poll {
  size: number
  color: string
  animDuration: number
  animDelay: number
}

export default function Home() {
  const router = useRouter()
  const [polls, setPolls] = useState<BubbleData[]>([])
  const [loading, setLoading] = useState(true)
  const [day, setDay] = useState(true)
  const [zoomingId, setZoomingId] = useState<string | null>(null)

  useEffect(() => {
    const dayMode = isDay()
    setDay(dayMode)
    document.body.className = dayMode ? 'day' : 'night'
  }, [])

  useEffect(() => {
    async function fetchPolls() {
      const { data: pollData } = await supabase
        .from('polls')
        .select('id, question, option_1, option_2')
        .eq('is_active', true)
        .or('expires_at.is.null,expires_at.gt.' + new Date().toISOString())
        .order('created_at', { ascending: false })

      if (!pollData || pollData.length === 0) {
        setPolls([])
        setLoading(false)
        return
      }

      // Fetch vote counts for all polls
      const { data: voteData } = await supabase
        .from('votes')
        .select('poll_id')
        .in('poll_id', pollData.map(p => p.id))

      const voteCounts: Record<string, number> = {}
      voteData?.forEach(v => {
        voteCounts[v.poll_id] = (voteCounts[v.poll_id] || 0) + 1
      })

      const colors = getBubbleColors()
      const bubbles: BubbleData[] = pollData
        .map((poll) => ({
          ...poll,
          voteCount: voteCounts[poll.id] || 0,
          size: 150 + Math.random() * 80,
          color: getRandomColor(colors),
          animDuration: 5 + Math.random() * 5,
          animDelay: -(Math.random() * 8),
        }))
        .sort((a, b) => b.voteCount - a.voteCount)

      setPolls(bubbles)
      setLoading(false)
    }
    fetchPolls()
  }, [])

  function handleClick(poll: BubbleData) {
    if (zoomingId) return
    setZoomingId(poll.id)
    setTimeout(() => router.push(`/poll/${poll.id}`), 600)
  }

  const textColor = day ? '#111' : '#f0f0f0'
  const subColor = day ? '#666' : '#999'

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', position: 'relative' }}>

      {/* Header */}
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '20px 28px',
      }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: textColor, margin: 0 }}>Majority</h1>
          <p style={{ fontSize: 13, color: subColor, margin: 0 }}>What does the world think?</p>
        </div>
        <a href="/create" style={{
          background: day ? '#111' : '#f0f0f0',
          color: day ? '#fff' : '#111',
          padding: '10px 20px', borderRadius: 100,
          fontSize: 13, fontWeight: 600, textDecoration: 'none',
        }}>
          + New Poll
        </a>
      </div>

      {loading ? (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: subColor, fontSize: 15,
        }}>
          Loading...
        </div>
      ) : polls.length === 0 ? (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          color: subColor, fontSize: 15, gap: 8,
        }}>
          <p style={{ margin: 0 }}>No polls yet.</p>
          <p style={{ margin: 0, fontSize: 13 }}>Be the first to create one!</p>
        </div>
      ) : (
        <div style={{
          position: 'absolute', top: 72, left: 0, right: 0, bottom: 0,
          display: 'flex', flexWrap: 'wrap',
          alignContent: 'center', justifyContent: 'center',
          gap: 40, padding: '20px 40px', overflow: 'hidden',
        }}>
          {polls.map((poll) => (
            <div
              key={poll.id}
              onClick={() => handleClick(poll)}
              className={zoomingId === poll.id ? 'bubble-zoom' : ''}
              style={{
                width: poll.size, height: poll.size,
                minWidth: poll.size, minHeight: poll.size,
                borderRadius: '50%', background: poll.color,
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', textAlign: 'center',
                padding: 20, flexShrink: 0,
                animation: `float ${poll.animDuration}s ease-in-out ${poll.animDelay}s infinite`,
                transition: 'transform 0.3s ease, box-shadow 0.3s ease',
                boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
                zIndex: zoomingId === poll.id ? 50 : 1,
              }}
              onMouseEnter={e => {
                if (!zoomingId) (e.currentTarget as HTMLElement).style.transform = 'scale(1.07)'
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.transform = 'scale(1)'
              }}
            >
              <span style={{
                fontSize: poll.size > 190 ? 15 : 13,
                fontWeight: 600, color: '#fff', lineHeight: 1.4,
                textShadow: '0 1px 4px rgba(0,0,0,0.25)',
                display: 'block', maxWidth: poll.size * 0.72,
                wordBreak: 'break-word', overflowWrap: 'break-word',
              }}>
                {poll.question}
              </span>
              {poll.voteCount > 0 && (
                <span style={{
                  fontSize: 11, color: 'rgba(255,255,255,0.75)',
                  marginTop: 6, fontWeight: 500,
                }}>
                  {poll.voteCount} {poll.voteCount === 1 ? 'vote' : 'votes'}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
