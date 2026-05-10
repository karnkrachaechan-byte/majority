// Server-rendered share landing page.
// Generates dynamic OG metadata so Telegram/WhatsApp/Twitter previews
// show the actual poll question. Real users are redirected to the home
// page with ?poll=ID, which auto-opens the modal.

import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase-admin'

interface Params { id: string }

async function getPoll(id: string) {
  const { data } = await supabaseAdmin
    .from('polls')
    .select('id, question, option_1, option_2')
    .eq('id', id)
    .single()
  return data
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { id } = await params
  const poll = await getPoll(id)
  if (!poll) {
    return {
      title: 'Majority',
      description: 'Vote on binary questions. See what the world thinks.',
    }
  }
  const title = poll.question
  const description = `${poll.option_1} vs ${poll.option_2} — vote and see how the world answered.`
  return {
    title: `${title} — Majority`,
    description,
    openGraph: {
      title,
      description,
      url: `https://www.majority.asia/p/${poll.id}`,
      siteName: 'Majority',
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  }
}

export default async function SharePage({ params }: { params: Promise<Params> }) {
  const { id } = await params
  // Redirect users to the home page with the poll modal auto-opening
  redirect(`/?poll=${id}`)
}
