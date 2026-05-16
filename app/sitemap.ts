import { MetadataRoute } from 'next'
import { supabaseAdmin } from '@/lib/supabase-admin'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = 'https://www.majority.asia'
  const { data: polls } = await supabaseAdmin
    .from('polls')
    .select('id, created_at')
    .eq('is_active', true)
    .eq('is_archived', false)
    .order('created_at', { ascending: false })
    .limit(1000)

  const pollEntries: MetadataRoute.Sitemap = (polls ?? []).map(p => ({
    url: `${base}/p/${p.id}`,
    lastModified: new Date(p.created_at),
    changeFrequency: 'daily',
    priority: 0.7,
  }))

  return [
    { url: base, lastModified: new Date(), changeFrequency: 'hourly', priority: 1 },
    { url: `${base}/create`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.6 },
    { url: `${base}/privacy`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.3 },
    ...pollEntries,
  ]
}
