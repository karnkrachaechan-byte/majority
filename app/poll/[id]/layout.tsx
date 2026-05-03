import { Metadata } from 'next'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const { data: poll } = await supabaseAdmin
    .from('polls')
    .select('question, option_1, option_2')
    .eq('id', id)
    .single()

  if (!poll) {
    return { title: 'Poll — Majority' }
  }

  const title = `${poll.question} — Majority`
  const description = `Vote now: ${poll.option_1} or ${poll.option_2}? See what the majority thinks.`

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      siteName: 'Majority',
    },
    twitter: {
      card: 'summary',
      title,
      description,
    },
  }
}

export default function PollLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
