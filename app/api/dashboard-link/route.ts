import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { Resend } from 'resend'
import { randomBytes } from 'crypto'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(req: NextRequest) {
  const { email } = await req.json()
  if (!email) return NextResponse.json({ error: 'Email required' }, { status: 400 })

  const { data: polls } = await supabaseAdmin
    .from('polls')
    .select('id')
    .eq('creator_email', email)
    .limit(1)

  if (!polls || polls.length === 0) {
    return NextResponse.json({ error: 'No polls found for this email' }, { status: 404 })
  }

  const token = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString()

  await supabaseAdmin.from('dashboard_tokens').insert({ email, token, expires_at: expiresAt })

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const dashUrl = `${appUrl}/dashboard?email=${encodeURIComponent(email)}&token=${token}`

  await resend.emails.send({
    from: 'Majority <onboarding@resend.dev>',
    to: email,
    subject: 'Your Majority dashboard link',
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
        <h2 style="font-size: 24px; font-weight: bold; color: #111;">Your dashboard</h2>
        <p style="color: #555; margin: 16px 0;">Click below to view and manage your polls:</p>
        <a href="${dashUrl}" style="display: inline-block; background: #000; color: #fff; padding: 14px 28px; border-radius: 100px; text-decoration: none; font-weight: 500;">
          Open my dashboard
        </a>
        <p style="color: #aaa; font-size: 12px; margin-top: 32px;">This link expires in 24 hours.</p>
      </div>
    `,
  })

  return NextResponse.json({ success: true })
}
