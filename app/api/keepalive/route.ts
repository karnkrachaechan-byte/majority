import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

// Called daily by Vercel Cron (see vercel.json). Supabase's free plan pauses a
// project after ~7 days without traffic, which takes the whole site down.
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { error } = await supabaseAdmin.from('polls').select('id', { head: true, count: 'exact' }).limit(1)
  if (error) {
    console.error('keepalive failed', error)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
  return NextResponse.json({ ok: true, at: new Date().toISOString() })
}
