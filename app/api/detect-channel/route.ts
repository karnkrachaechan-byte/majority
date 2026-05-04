import { NextRequest, NextResponse } from 'next/server'
import { detectChannel } from '@/lib/channels'

export async function GET(req: NextRequest) {
  const country = req.headers.get('x-vercel-ip-country') || ''
  const channel = detectChannel(country)
  return NextResponse.json({ channel, country })
}
