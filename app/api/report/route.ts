import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getIP, isValidFingerprint, isValidId, signLink } from '@/lib/server-utils'

const HIDE_THRESHOLD = 5

export async function POST(req: NextRequest) {
  try {
    const { poll_id, fingerprint } = await req.json()
    if (!isValidId(poll_id)) {
      return NextResponse.json({ error: 'Missing poll_id' }, { status: 400 })
    }

    // One report per person — otherwise a single visitor could hide any poll
    // by clicking report five times. Hashed so no raw IP is stored.
    const reporter = signLink('report', isValidFingerprint(fingerprint) ? fingerprint : getIP(req)).slice(0, 32)

    const { error } = await supabaseAdmin.from('reports').insert({ poll_id, reporter })
    if (error?.code === '23505') {
      return NextResponse.json({ success: true }) // already reported by this person
    }
    if (error) throw error

    const { count } = await supabaseAdmin
      .from('reports')
      .select('*', { count: 'exact', head: true })
      .eq('poll_id', poll_id)

    await supabaseAdmin
      .from('polls')
      .update({ report_count: count ?? 0, ...((count ?? 0) >= HIDE_THRESHOLD ? { is_active: false } : {}) })
      .eq('id', poll_id)

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    console.error(err)
    return NextResponse.json({ error: 'Failed to report' }, { status: 500 })
  }
}
