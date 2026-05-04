import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(req: NextRequest) {
  const { poll_id, fingerprint } = await req.json()
  if (!poll_id) return NextResponse.json({ error: 'Missing poll_id' }, { status: 400 })

  // Verify ownership
  const { data: poll } = await supabaseAdmin
    .from('polls')
    .select('id, question, option_1, option_2, creator_email, creator_fingerprint')
    .eq('id', poll_id)
    .single()

  if (!poll) return NextResponse.json({ error: 'Poll not found' }, { status: 404 })

  const ownsViaFingerprint = fingerprint && poll.creator_fingerprint === fingerprint
  if (!ownsViaFingerprint) return NextResponse.json({ error: 'Not authorised' }, { status: 401 })

  // Get vote count
  const { count } = await supabaseAdmin
    .from('votes')
    .select('id', { count: 'exact', head: true })
    .eq('poll_id', poll_id)

  await resend.emails.send({
    from: 'Majority <onboarding@resend.dev>',
    to: 'karnkrachaechan@gmail.com',
    subject: `Archive Request — ${poll.question}`,
    html: `
      <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; padding: 40px 20px;">
        <h2 style="font-size: 22px; font-weight: bold; color: #111;">Archive Request</h2>
        <p style="color: #555; margin: 16px 0;">A creator has requested to archive a popular poll.</p>
        <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px; margin: 24px 0;">
          <p style="font-weight: 600; color: #111; margin: 0 0 8px;">${poll.question}</p>
          <p style="color: #555; margin: 4px 0;">A: ${poll.option_1} &nbsp;|&nbsp; B: ${poll.option_2}</p>
          <p style="color: #555; margin: 8px 0 0;"><strong>${count ?? 0} votes</strong></p>
          <p style="color: #888; font-size: 13px; margin: 4px 0;">Poll ID: ${poll.id}</p>
          <p style="color: #888; font-size: 13px; margin: 4px 0;">Creator email: ${poll.creator_email || '—'}</p>
        </div>
        <p style="color: #555;">Review and archive manually in Supabase if appropriate.</p>
      </div>
    `,
  })

  return NextResponse.json({ success: true })
}
