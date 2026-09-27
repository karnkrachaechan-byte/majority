import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { isValidFingerprint, isValidId } from '@/lib/server-utils'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const pollId = searchParams.get('poll_id')
  const fingerprint = searchParams.get('fingerprint')

  if (!isValidId(pollId) || !isValidFingerprint(fingerprint)) {
    return NextResponse.json({ vote: null })
  }

  const { data } = await supabaseAdmin
    .from('votes')
    .select('choice, can_change_until, voter_age, has_changed')
    .eq('poll_id', pollId)
    .eq('fingerprint', fingerprint)
    .limit(1)
    .maybeSingle()

  return NextResponse.json({ vote: data || null })
}
