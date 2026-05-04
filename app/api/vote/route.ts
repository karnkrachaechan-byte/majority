import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

function getIP(req: NextRequest) {
  return req.headers.get('x-forwarded-for')?.split(',')[0] || req.headers.get('x-real-ip') || '0.0.0.0'
}

function getCountry(req: NextRequest) {
  return req.headers.get('x-vercel-ip-country') || null
}

// Cast a new vote
export async function POST(req: NextRequest) {
  try {
    const { poll_id, choice, fingerprint, age, gender } = await req.json()
    const ip = getIP(req)
    const country = getCountry(req)

    if (!poll_id || !choice || !fingerprint) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }

    // Check if already voted
    const { data: existing } = await supabaseAdmin
      .from('votes')
      .select('id')
      .eq('poll_id', poll_id)
      .or(`fingerprint.eq.${fingerprint},ip_address.eq.${ip}`)
      .single()

    if (existing) {
      return NextResponse.json({ error: 'Already voted' }, { status: 400 })
    }

    const { error } = await supabaseAdmin.from('votes').insert({
      poll_id,
      choice,
      ip_address: ip,
      fingerprint,
      country,
      ...(age ? { voter_age: age } : {}),
      ...(gender ? { voter_gender: gender } : {}),
    })

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    console.error(err)
    return NextResponse.json({ error: 'Failed to vote' }, { status: 500 })
  }
}

// Change existing vote
export async function PATCH(req: NextRequest) {
  try {
    const { poll_id, choice, fingerprint } = await req.json()
    const ip = getIP(req)

    if (!poll_id || !choice || !fingerprint) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }

    // Find the existing vote
    const { data: existing } = await supabaseAdmin
      .from('votes')
      .select('id, can_change_until')
      .eq('poll_id', poll_id)
      .or(`fingerprint.eq.${fingerprint},ip_address.eq.${ip}`)
      .single()

    if (!existing) {
      return NextResponse.json({ error: 'No vote found' }, { status: 400 })
    }

    // Check if within change window
    if (new Date() > new Date(existing.can_change_until)) {
      return NextResponse.json({ error: 'Vote is locked — 10 minute window has passed' }, { status: 400 })
    }

    const { error } = await supabaseAdmin
      .from('votes')
      .update({ choice })
      .eq('id', existing.id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    console.error(err)
    return NextResponse.json({ error: 'Failed to change vote' }, { status: 500 })
  }
}
