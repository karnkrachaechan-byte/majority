import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { appUrl, isValidId, verifyLink } from '@/lib/server-utils'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const pollId = searchParams.get('poll_id')
  const exp = searchParams.get('exp')
  const sig = searchParams.get('sig')

  if (!isValidId(pollId) || !exp || !verifyLink(sig, 'verify', pollId, exp)) {
    return NextResponse.redirect(new URL('/?error=invalid_link', appUrl()))
  }
  if (Date.now() > Number(exp)) {
    return NextResponse.redirect(new URL('/?error=link_expired', appUrl()))
  }

  const { data: poll } = await supabaseAdmin
    .from('polls')
    .select('id, is_active, is_archived, report_count')
    .eq('id', pollId)
    .maybeSingle()

  // Already live (link clicked twice) — just go there
  if (poll?.is_active) {
    return NextResponse.redirect(new URL(`/poll/${pollId}`, appUrl()))
  }
  // Don't let a re-clicked link revive a poll that was reported off the site
  if (!poll || poll.is_archived || (poll.report_count ?? 0) >= 5) {
    return NextResponse.redirect(new URL('/?error=invalid_link', appUrl()))
  }

  const { error } = await supabaseAdmin.from('polls').update({ is_active: true }).eq('id', pollId)
  if (error) {
    return NextResponse.redirect(new URL('/?error=invalid_link', appUrl()))
  }

  return NextResponse.redirect(new URL(`/poll/${pollId}`, appUrl()))
}
