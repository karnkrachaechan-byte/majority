import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function POST(req: NextRequest) {
  try {
    const { poll_id } = await req.json()

    await supabaseAdmin.from('reports').insert({ poll_id })

    // Auto-hide poll if reported 5+ times
    const { count } = await supabaseAdmin
      .from('reports')
      .select('*', { count: 'exact', head: true })
      .eq('poll_id', poll_id)

    if (count && count >= 5) {
      await supabaseAdmin
        .from('polls')
        .update({ is_active: false })
        .eq('id', poll_id)
    }

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    console.error(err)
    return NextResponse.json({ error: 'Failed to report' }, { status: 500 })
  }
}
