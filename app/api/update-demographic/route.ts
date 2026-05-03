import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function POST(req: NextRequest) {
  try {
    const { poll_id, fingerprint, age, gender } = await req.json()
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0] || req.headers.get('x-real-ip') || '0.0.0.0'

    const updateData: Record<string, unknown> = {}
    if (age) updateData.voter_age = age
    if (gender) updateData.voter_gender = gender

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ success: true })
    }

    await supabaseAdmin
      .from('votes')
      .update(updateData)
      .eq('poll_id', poll_id)
      .or(`fingerprint.eq.${fingerprint},ip_address.eq.${ip}`)

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    console.error(err)
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 })
  }
}
