import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { isValidFingerprint, isValidId } from '@/lib/server-utils'

const GENDERS = new Set(['male', 'female', 'prefer_not_to_say'])

export async function POST(req: NextRequest) {
  try {
    const { poll_id, fingerprint, age, gender } = await req.json()

    if (!isValidId(poll_id) || !isValidFingerprint(fingerprint)) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }

    const updateData: Record<string, unknown> = {}
    if (typeof age === 'number' && Number.isInteger(age) && age >= 1 && age <= 120) updateData.voter_age = age
    if (typeof gender === 'string' && GENDERS.has(gender)) updateData.voter_gender = gender

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ success: true })
    }

    await supabaseAdmin
      .from('votes')
      .update(updateData)
      .eq('poll_id', poll_id)
      .eq('fingerprint', fingerprint)

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    console.error(err)
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 })
  }
}
