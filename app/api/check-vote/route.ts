import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const pollId = searchParams.get('poll_id')
  const fingerprint = searchParams.get('fingerprint')
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0] || req.headers.get('x-real-ip') || '0.0.0.0'

  if (!pollId || !fingerprint) {
    return NextResponse.json({ vote: null })
  }

  const { data } = await supabaseAdmin
    .from('votes')
    .select('choice, can_change_until, voter_age')
    .eq('poll_id', pollId)
    .or(`fingerprint.eq.${fingerprint},ip_address.eq.${ip}`)
    .single()

  return NextResponse.json({ vote: data || null })
}
