import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const email = searchParams.get('email')
  const token = searchParams.get('token')

  if (!email || !token) return NextResponse.json({ error: 'Invalid' }, { status: 401 })

  const { data: tokenRow } = await supabaseAdmin
    .from('dashboard_tokens')
    .select('expires_at')
    .eq('email', email)
    .eq('token', token)
    .single()

  if (!tokenRow || new Date() > new Date(tokenRow.expires_at)) {
    return NextResponse.json({ error: 'Link expired' }, { status: 401 })
  }

  const { data: polls } = await supabaseAdmin
    .from('polls')
    .select('id, question, option_1, option_2, is_active, created_at, expires_at')
    .eq('creator_email', email)
    .order('created_at', { ascending: false })

  const pollIds = polls?.map(p => p.id) ?? []
  const { data: votes } = pollIds.length > 0
    ? await supabaseAdmin.from('votes').select('poll_id').in('poll_id', pollIds)
    : { data: [] }

  const voteCounts: Record<string, number> = {}
  votes?.forEach(v => { voteCounts[v.poll_id] = (voteCounts[v.poll_id] || 0) + 1 })

  const result = polls?.map(p => ({ ...p, voteCount: voteCounts[p.id] || 0 })) ?? []
  return NextResponse.json({ polls: result })
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const email = searchParams.get('email')
  const token = searchParams.get('token')
  const pollId = searchParams.get('poll_id')

  if (!email || !token || !pollId) return NextResponse.json({ error: 'Invalid' }, { status: 401 })

  const { data: tokenRow } = await supabaseAdmin
    .from('dashboard_tokens')
    .select('expires_at')
    .eq('email', email)
    .eq('token', token)
    .single()

  if (!tokenRow || new Date() > new Date(tokenRow.expires_at)) {
    return NextResponse.json({ error: 'Link expired' }, { status: 401 })
  }

  await supabaseAdmin.from('polls').delete().eq('id', pollId).eq('creator_email', email)
  return NextResponse.json({ success: true })
}
