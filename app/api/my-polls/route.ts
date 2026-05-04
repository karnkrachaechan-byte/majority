import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

async function getPollsWithCounts(ids: string[]) {
  if (ids.length === 0) return []
  const { data: votes } = await supabaseAdmin
    .from('votes').select('poll_id').in('poll_id', ids)
  const voteCounts: Record<string, number> = {}
  votes?.forEach(v => { voteCounts[v.poll_id] = (voteCounts[v.poll_id] || 0) + 1 })
  return voteCounts
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const fingerprint = searchParams.get('fingerprint')
  const email = searchParams.get('email')
  const token = searchParams.get('token')

  let polls = null

  // Primary: fingerprint lookup
  if (fingerprint) {
    const { data } = await supabaseAdmin
      .from('polls')
      .select('id, question, option_1, option_2, is_active, created_at, expires_at, creator_fingerprint')
      .eq('creator_fingerprint', fingerprint)
      .eq('is_archived', false)
      .order('created_at', { ascending: false })
    polls = data
  }
  // Fallback: email + token
  else if (email && token) {
    const { data: tokenRow } = await supabaseAdmin
      .from('dashboard_tokens')
      .select('expires_at')
      .eq('email', email)
      .eq('token', token)
      .single()
    if (!tokenRow || new Date() > new Date(tokenRow.expires_at)) {
      return NextResponse.json({ error: 'Link expired' }, { status: 401 })
    }
    const { data } = await supabaseAdmin
      .from('polls')
      .select('id, question, option_1, option_2, is_active, created_at, expires_at')
      .eq('creator_email', email)
      .eq('is_archived', false)
      .order('created_at', { ascending: false })
    polls = data
  } else {
    return NextResponse.json({ error: 'No identifier provided' }, { status: 400 })
  }

  const pollIds = polls?.map((p: { id: string }) => p.id) ?? []
  const voteCounts = await getPollsWithCounts(pollIds)
  const result = polls?.map((p: { id: string }) => ({ ...p, voteCount: (voteCounts as Record<string, number>)[p.id] || 0 })) ?? []
  return NextResponse.json({ polls: result })
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const fingerprint = searchParams.get('fingerprint')
  const email = searchParams.get('email')
  const token = searchParams.get('token')
  const pollId = searchParams.get('poll_id')

  if (!pollId) return NextResponse.json({ error: 'Missing poll_id' }, { status: 400 })

  // Primary: fingerprint archive
  if (fingerprint) {
    await supabaseAdmin
      .from('polls').update({ is_archived: true })
      .eq('id', pollId)
      .eq('creator_fingerprint', fingerprint)
    return NextResponse.json({ success: true })
  }

  // Fallback: email + token archive
  if (email && token) {
    const { data: tokenRow } = await supabaseAdmin
      .from('dashboard_tokens')
      .select('expires_at')
      .eq('email', email)
      .eq('token', token)
      .single()
    if (!tokenRow || new Date() > new Date(tokenRow.expires_at)) {
      return NextResponse.json({ error: 'Link expired' }, { status: 401 })
    }
    await supabaseAdmin.from('polls').update({ is_archived: true }).eq('id', pollId).eq('creator_email', email)
    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: 'No identifier provided' }, { status: 400 })
}
