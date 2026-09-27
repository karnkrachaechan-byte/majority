import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getIP, isValidChoice, isValidFingerprint, isValidId } from '@/lib/server-utils'

// Shared wifi / mobile carrier NAT means many real people share one IP,
// so IP is only a soft cap against scripted spam, not the dedupe key.
const MAX_VOTES_PER_IP_PER_POLL = 25

const GENDERS = new Set(['male', 'female', 'prefer_not_to_say'])

function getVoterCountry(req: NextRequest) {
  return req.headers.get('x-vercel-ip-country') || null
}

function cleanAge(age: unknown) {
  return typeof age === 'number' && Number.isInteger(age) && age >= 1 && age <= 120 ? age : null
}

function cleanGender(gender: unknown) {
  return typeof gender === 'string' && GENDERS.has(gender) ? gender : null
}

// Cast a new vote
export async function POST(req: NextRequest) {
  try {
    const { poll_id, choice, fingerprint, age, gender } = await req.json()
    const ip = getIP(req)
    const voter_country = getVoterCountry(req)

    if (!isValidId(poll_id) || !isValidChoice(choice) || !isValidFingerprint(fingerprint)) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }

    const { data: poll } = await supabaseAdmin
      .from('polls').select('id').eq('id', poll_id).eq('is_active', true).eq('is_archived', false).maybeSingle()
    if (!poll) {
      return NextResponse.json({ error: 'Poll not found' }, { status: 404 })
    }

    // Check if already voted
    const { data: existing } = await supabaseAdmin
      .from('votes')
      .select('id')
      .eq('poll_id', poll_id)
      .eq('fingerprint', fingerprint)
      .limit(1)
      .maybeSingle()

    if (existing) {
      return NextResponse.json({ error: 'Already voted' }, { status: 400 })
    }

    const { count: ipCount } = await supabaseAdmin
      .from('votes')
      .select('id', { count: 'exact', head: true })
      .eq('poll_id', poll_id)
      .eq('ip_address', ip)

    if ((ipCount ?? 0) >= MAX_VOTES_PER_IP_PER_POLL) {
      return NextResponse.json({ error: 'Too many votes from this network' }, { status: 429 })
    }

    // Allow vote change within 5 minutes
    const can_change_until = new Date(Date.now() + 5 * 60 * 1000).toISOString()
    const voter_age = cleanAge(age)
    const voter_gender = cleanGender(gender)

    const { error } = await supabaseAdmin.from('votes').insert({
      poll_id,
      choice,
      ip_address: ip,
      fingerprint,
      voter_country,
      can_change_until,
      ...(voter_age ? { voter_age } : {}),
      ...(voter_gender ? { voter_gender } : {}),
    })

    if (error) throw error

    // Live counter on the homepage (the votes table itself is not public)
    await supabaseAdmin.channel('votes-feed').send({
      type: 'broadcast', event: 'vote', payload: { poll_id, choice },
    }).catch(() => {})

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

    if (!isValidId(poll_id) || !isValidChoice(choice) || !isValidFingerprint(fingerprint)) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }

    // Find the existing vote
    const { data: existing } = await supabaseAdmin
      .from('votes')
      .select('id, choice, can_change_until, has_changed')
      .eq('poll_id', poll_id)
      .eq('fingerprint', fingerprint)
      .limit(1)
      .maybeSingle()

    if (!existing) {
      return NextResponse.json({ error: 'No vote found' }, { status: 400 })
    }

    if (existing.has_changed) {
      return NextResponse.json({ error: 'You have already changed your vote once.' }, { status: 400 })
    }

    if (!existing.can_change_until || new Date() > new Date(existing.can_change_until)) {
      return NextResponse.json({ error: 'Vote is locked — 5 minute window has passed' }, { status: 400 })
    }

    if (existing.choice === choice) {
      return NextResponse.json({ success: true })
    }

    const { error } = await supabaseAdmin
      .from('votes')
      .update({ choice, has_changed: true })
      .eq('id', existing.id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    console.error(err)
    return NextResponse.json({ error: 'Failed to change vote' }, { status: 500 })
  }
}
