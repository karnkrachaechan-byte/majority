import { NextRequest } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'

// Server-side only — never import this in client components

export function getIP(req: NextRequest) {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || '0.0.0.0'
}

// FingerprintJS visitorIds are short alphanumeric strings. Anything else is
// rejected so it can never be interpolated into a PostgREST filter.
export function isValidFingerprint(fp: unknown): fp is string {
  return typeof fp === 'string' && /^[A-Za-z0-9_-]{6,128}$/.test(fp)
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function isValidId(id: unknown): id is string {
  return typeof id === 'string' && UUID_RE.test(id)
}

export function isValidChoice(c: unknown): c is 1 | 2 {
  return c === 1 || c === 2
}

export function isValidEmail(email: unknown): email is string {
  return typeof email === 'string' && email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// ── Signed links ─────────────────────────────────────────────
// Derived from the service role key so no extra env var is needed.
function secret() {
  return process.env.LINK_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
}

export function signLink(...parts: string[]) {
  return createHmac('sha256', secret()).update(parts.join('|')).digest('hex')
}

export function verifyLink(sig: string | null, ...parts: string[]) {
  if (!sig || !secret()) return false
  const expected = Buffer.from(signLink(...parts), 'hex')
  const given = Buffer.from(sig, 'hex')
  return given.length === expected.length && timingSafeEqual(given, expected)
}

// ── Email ────────────────────────────────────────────────────
// Set EMAIL_FROM (e.g. "Majority <hello@majority.asia>") once the domain is
// verified in Resend. The resend.dev fallback only delivers to the account owner.
export const EMAIL_FROM = process.env.EMAIL_FROM || 'Majority <onboarding@resend.dev>'

// Links in emails should always use the real domain in production, whatever
// NEXT_PUBLIC_APP_URL happens to be set to (it was the old *.vercel.app URL).
export function appUrl() {
  if (process.env.VERCEL_ENV === 'production') return 'https://www.majority.asia'
  return process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
}
