import { ImageResponse } from 'next/og'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const runtime = 'nodejs'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { data: poll } = await supabaseAdmin
    .from('polls')
    .select('question, option_1, option_2')
    .eq('id', id)
    .single()

  const question = poll?.question ?? 'Vote now'
  const opt1 = poll?.option_1 ?? 'Option 1'
  const opt2 = poll?.option_2 ?? 'Option 2'

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%', height: '100%',
          background: '#0f0f0f',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          padding: '60px 80px', gap: 40,
          fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
        }}
      >
        <div style={{ fontSize: 18, color: '#666', letterSpacing: '0.15em', textTransform: 'uppercase', display: 'flex' }}>
          MAJORITY
        </div>
        <div style={{
          fontSize: 52, fontWeight: 700, color: '#f0f0f0',
          textAlign: 'center', lineHeight: 1.3, maxWidth: 900, display: 'flex',
        }}>
          {question}
        </div>
        <div style={{ display: 'flex', gap: 24 }}>
          <div style={{
            background: '#FF6B6B', borderRadius: 100,
            padding: '16px 36px', fontSize: 24, fontWeight: 600, color: '#fff', display: 'flex',
          }}>
            {opt1}
          </div>
          <div style={{
            background: '#56CCF2', borderRadius: 100,
            padding: '16px 36px', fontSize: 24, fontWeight: 600, color: '#fff', display: 'flex',
          }}>
            {opt2}
          </div>
        </div>
        <div style={{ fontSize: 16, color: '#444', display: 'flex' }}>
          majority-sand.vercel.app
        </div>
      </div>
    ),
    { ...size }
  )
}
