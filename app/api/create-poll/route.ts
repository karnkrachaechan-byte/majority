import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(req: NextRequest) {
  try {
    const { question, option1, option2, age, gender, email, fingerprint, channel } = await req.json()

    if (!question || !option1 || !option2 || !age || !gender || !email) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
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
        creator_fingerprint: fingerprint || null,
        channel: channel || 'global',
        is_active: false,
      })
      .select()
      .single()

    if (error) throw error

    // Send magic link email
    const verifyUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/verify?poll_id=${poll.id}&email=${encodeURIComponent(email)}`

    await resend.emails.send({
      from: 'Majority <onboarding@resend.dev>',
      to: email,
      subject: 'Verify your poll on Majority',
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
          <h2 style="font-size: 24px; font-weight: bold; color: #111;">Your poll is ready!</h2>
          <p style="color: #555; margin: 16px 0;">Click the button below to publish it:</p>
          <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px; margin: 24px 0;">
            <p style="font-weight: 600; color: #111; margin: 0 0 12px;">${question}</p>
            <p style="color: #555; margin: 4px 0;">1. ${option1}</p>
            <p style="color: #555; margin: 4px 0;">2. ${option2}</p>
          </div>
          <a href="${verifyUrl}" style="display: inline-block; background: #000; color: #fff; padding: 14px 28px; border-radius: 100px; text-decoration: none; font-weight: 500;">
            Publish my poll
          </a>
          <p style="color: #aaa; font-size: 12px; margin-top: 32px;">This link expires in 24 hours.</p>
        </div>
      `,
    })

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    console.error(err)
    return NextResponse.json({ error: 'Failed to create poll' }, { status: 500 })
  }
}
