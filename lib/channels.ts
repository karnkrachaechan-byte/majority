export interface Channel {
  id: string
  name: string
  flag: string
  language: string
  countries: string[]
}

export const CHANNELS: Channel[] = [
  { id: 'global', name: 'Global',    flag: '🌍', language: 'English',          countries: [] },
  { id: 'th',     name: 'Thailand',  flag: '🇹🇭', language: 'ภาษาไทย',          countries: ['TH'] },
  { id: 'vn',     name: 'Vietnam',   flag: '🇻🇳', language: 'Tiếng Việt',       countries: ['VN'] },
  { id: 'id',     name: 'Indonesia', flag: '🇮🇩', language: 'Bahasa Indonesia',  countries: ['ID'] },
  { id: 'jp',     name: 'Japan',     flag: '🇯🇵', language: '日本語',             countries: ['JP'] },
  { id: 'kr',     name: 'Korea',     flag: '🇰🇷', language: '한국어',             countries: ['KR'] },
  { id: 'cn',     name: 'Chinese',   flag: '🇨🇳', language: '繁體中文',           countries: ['TW', 'HK', 'SG'] },
  { id: 'ar',     name: 'Arab',      flag: '🇸🇦', language: 'العربية',           countries: ['SA','AE','EG','MA','DZ','IQ','JO','KW','LB','LY','OM','QA','SD','SY','TN','YE'] },
  { id: 'br',     name: 'Brazil',    flag: '🇧🇷', language: 'Português',         countries: ['BR'] },
  { id: 'latam',  name: 'LatAm',     flag: '🇪🇸', language: 'Español',           countries: ['MX','CO','AR','CL','PE','VE','EC','GT','CU','BO','DO','HN','PY','SV','NI','CR','PA','UY'] },
]

export function detectChannel(countryCode: string): string {
  if (!countryCode) return 'global'
  const ch = CHANNELS.find(c => c.countries.includes(countryCode))
  return ch?.id ?? 'global'
}

export function getChannel(id: string): Channel {
  return CHANNELS.find(c => c.id === id) ?? CHANNELS[0]
}
