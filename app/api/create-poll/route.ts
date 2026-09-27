import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { Resend } from 'resend'
import { CHANNELS } from '@/lib/channels'
import { EMAIL_FROM, appUrl, escapeHtml, getIP, isValidEmail, isValidFingerprint, signLink } from '@/lib/server-utils'

const resend = new Resend(process.env.RESEND_API_KEY)

const MAX_QUESTION = 200
const MAX_OPTION = 60
const MAX_PENDING_PER_EMAIL = 5

function clean(s: unknown, max: number) {
  return typeof s === 'string' ? s.trim().replace(/\s+/g, ' ').slice(0, max) : ''
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const question = clean(body.question, MAX_QUESTION)
    const option1 = clean(body.option1, MAX_OPTION)
    const option2 = clean(body.option2, MAX_OPTION)
    const email = typeof body.email === 'string' ? body.email.trim() : ''
    const { age, gender } = body
    const fingerprint = isValidFingerprint(body.fingerprint) ? body.fingerprint : null
    const channel = CHANNELS.some(c => c.id === body.channel) ? body.channel : 'global'

    if (!question || !option1 || !option2 || !age || !gender || !email) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }
    if (!isValidEmail(email)) {
      return NextResponse.json({ error: 'Please enter a valid email.' }, { status: 400 })
    }
    if (option1.toLowerCase() === option2.toLowerCase()) {
      return NextResponse.json({ error: 'The two options must be different.' }, { status: 400 })
    }

    // Stop one address from flooding the verification queue
    const { count: pending } = await supabaseAdmin
      .from('polls')
      .select('id', { count: 'exact', head: true })
      .eq('creator_email', email)
      .eq('is_active', false)
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    if ((pending ?? 0) >= MAX_PENDING_PER_EMAIL) {
      return NextResponse.json({ error: 'Too many unverified polls. Check your inbox first.' }, { status: 429 })
    }

    // Create poll in pending state (is_active = false until verified)
    const { data: poll, error } = await supabaseAdmin
      .from('polls')
      .insert({
        question,
        option_1: option1,
        option_2: option2,
        creator_age: age,
        creator_gender: gender,
        creator_email: email,
        creator_fingerprint: fingerprint,
        creator_ip: getIP(req),
        channel,
        is_active: false,
      })
      .select()
      .single()

    if (error) throw error

    // Send magic link email — signed so it can't be forged from the poll id alone
    const exp = String(Date.now() + 24 * 60 * 60 * 1000)
    const sig = signLink('verify', poll.id, exp)
    const verifyUrl = `${appUrl()}/api/verify?poll_id=${poll.id}&exp=${exp}&sig=${sig}`

    const { error: mailError } = await resend.emails.send({
      from: EMAIL_FROM,
      to: email,
      subject: 'Verify your poll on Majority',
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
          <h2 style="font-size: 24px; font-weight: bold; color: #111;">Your poll is ready!</h2>
          <p style="color: #555; margin: 16px 0;">Click the button below to publish it:</p>
          <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px; margin: 24px 0;">
            <p style="font-weight: 600; color: #111; margin: 0 0 12px;">${escapeHtml(question)}</p>
            <p style="color: #555; margin: 4px 0;">1. ${escapeHtml(option1)}</p>
            <p style="color: #555; margin: 4px 0;">2. ${escapeHtml(option2)}</p>
          </div>
          <a href="${verifyUrl}" style="display: inline-block; background: #000; color: #fff; padding: 14px 28px; border-radius: 100px; text-decoration: none; font-weight: 500;">
            Publish my poll
          </a>
          <p style="color: #aaa; font-size: 12px; margin-top: 32px;">This link expires in 24 hours.</p>
        </div>
      `,
    })

    if (mailError) {
      console.error('Resend error', mailError)
      await supabaseAdmin.from('polls').delete().eq('id', poll.id)
      return NextResponse.json({ error: 'We couldn’t send the verification email. Please try again later.' }, { status: 502 })
    }

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    console.error(err)
    return NextResponse.json({ error: 'Failed to create poll' }, { status: 500 })
  }
}
