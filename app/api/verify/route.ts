import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const pollId = searchParams.get('poll_id')
  const email = searchParams.get('email')

  if (!pollId || !email) {
    return NextResponse.redirect(new URL('/?error=invalid_link', req.url))
  }

  const { data: poll, error } = await supabaseAdmin
    .from('polls')
    .update({ is_active: true })
    .eq('id', pollId)
    .eq('creator_email', email)
    .select()
    .single()

  if (error || !poll) {
    return NextResponse.redirect(new URL('/?error=invalid_link', req.url))
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  return NextResponse.redirect(new URL(`/poll/${pollId}`, appUrl))
}
