export type Lang = 'global' | 'th'

const translations: Record<Lang, Record<string, string>> = {
  global: {
    // Homepage
    'home.headline':        'What does {the} world think?',
    'home.headline.the':    'the',
    'home.subtext':         'Real answers, every age and gender. Cast your vote to see how the world answered.',
    'home.status.day':      'DAYTIME',
    'home.status.night':    'NIGHTTIME',
    'home.status.live':     'LIVE',
    'home.status.voting':   'VOTING NOW',
    'home.stats':           '{n} {poll} in orbit · {votes} voices · No login required',
    'home.poll':            'poll',
    'home.polls':           'polls',
    'home.ask':             'ASK',
    'home.ask.sub':         'your own',

    // Vote page
    'vote.hint':            'One vote per person · changeable within 10 min',
    'vote.total':           '{n} vote total',
    'vote.totals':          '{n} votes total',
    'vote.change':          'Tap the other planet to change your vote',

    // Demographic form
    'demo.title':           'One quick thing',
    'demo.sub':             'Help us show how your group voted',
    'demo.age':             'Your age',
    'demo.age.placeholder': '28',
    'demo.gender':          'Select gender',
    'demo.gender.male':     'Male',
    'demo.gender.female':   'Female',
    'demo.gender.other':    'Prefer not to say',
    'demo.submit':          'See results →',
    'demo.submitting':      'Loading…',
    'demo.consent':         'By continuing you agree that your anonymous demographic data may be used for research purposes.',
    'demo.privacy':         'Privacy policy',

    // Swap confirm
    'swap.title':           'Switch your vote?',
    'swap.body':            'You can only change your vote {once}. After this, your choice is locked for good.',
    'swap.once':            'once',
    'swap.confirm':         'Yes, switch my vote',
    'swap.cancel':          'Cancel',

    // Create page
    'create.title':         'Ask the world',
    'create.sub':           'Post a binary question — see how everyone answers.',
    'create.channel':       'Channel',
    'create.question':      'Your question',
    'create.question.ph':   'Are you a dog or cat person?',
    'create.choices':       'Two choices',
    'create.a.ph':          'Option A  (e.g. Dog)',
    'create.b.ph':          'Option B  (e.g. Cat)',
    'create.age':           'Your age',
    'create.age.ph':        '28',
    'create.gender':        'Gender',
    'create.email':         'Your email',
    'create.email.note':    '(for verification only)',
    'create.email.ph':      'you@example.com',
    'create.submit':        'Send verification email →',
    'create.submitting':    'Sending…',

    // Nav
    'nav.mypolls':          'My polls',
    'nav.ask':              '+ Ask the world',
  },

  th: {
    // Homepage
    'home.headline':        'โลกคิดอย่างไร?',
    'home.headline.the':    '',
    'home.subtext':         'คำตอบจริง ทุกวัย ทุกเพศ โหวตเพื่อดูว่าคนทั้งโลกคิดอย่างไร',
    'home.status.day':      'กลางวัน',
    'home.status.night':    'กลางคืน',
    'home.status.live':     'LIVE',
    'home.status.voting':   'กำลังโหวต',
    'home.stats':           '{n} {poll} · {votes} เสียง · ไม่ต้องสมัครสมาชิก',
    'home.poll':            'โพล',
    'home.polls':           'โพล',
    'home.ask':             'ถาม',
    'home.ask.sub':         'ถามโลก',

    // Vote page
    'vote.hint':            'หนึ่งเสียงต่อคน · เปลี่ยนได้ภายใน 10 นาที',
    'vote.total':           '{n} เสียง',
    'vote.totals':          '{n} เสียง',
    'vote.change':          'แตะดาวเคราะห์อีกดวงเพื่อเปลี่ยนเสียง',

    // Demographic form
    'demo.title':           'แค่เรื่องเดียว',
    'demo.sub':             'ช่วยให้เราแสดงผลตามกลุ่มของคุณ',
    'demo.age':             'อายุของคุณ',
    'demo.age.placeholder': 'เช่น 28',
    'demo.gender':          'เลือกเพศ',
    'demo.gender.male':     'ชาย',
    'demo.gender.female':   'หญิง',
    'demo.gender.other':    'ไม่ระบุ',
    'demo.submit':          'ดูผล →',
    'demo.submitting':      'กำลังโหลด…',
    'demo.consent':         'การดำเนินการต่อถือว่าคุณยินยอมให้ใช้ข้อมูลประชากรที่ไม่ระบุตัวตนเพื่อการวิจัย',
    'demo.privacy':         'นโยบายความเป็นส่วนตัว',

    // Swap confirm
    'swap.title':           'เปลี่ยนใจแล้วใช่ไหม?',
    'swap.body':            'คุณสามารถเปลี่ยนเสียงได้ {once} ครั้งเท่านั้น หลังจากนี้จะไม่สามารถเปลี่ยนได้อีก',
    'swap.once':            'หนึ่ง',
    'swap.confirm':         'ใช่ เปลี่ยนเลย',
    'swap.cancel':          'ยกเลิก',

    // Create page
    'create.title':         'ถามคนทั้งโลก',
    'create.sub':           'ตั้งคำถามสองตัวเลือก แล้วดูว่าทุกคนตอบว่าอะไร',
    'create.channel':       'ช่อง',
    'create.question':      'คำถามของคุณ',
    'create.question.ph':   'คุณชอบหมาหรือแมว?',
    'create.choices':       'สองตัวเลือก',
    'create.a.ph':          'ตัวเลือก A (เช่น หมา)',
    'create.b.ph':          'ตัวเลือก B (เช่น แมว)',
    'create.age':           'อายุของคุณ',
    'create.age.ph':        'เช่น 28',
    'create.gender':        'เพศ',
    'create.email':         'อีเมลของคุณ',
    'create.email.note':    '(สำหรับยืนยันตัวตนเท่านั้น)',
    'create.email.ph':      'you@example.com',
    'create.submit':        'ส่งอีเมลยืนยัน →',
    'create.submitting':    'กำลังส่ง…',

    // Nav
    'nav.mypolls':          'โพลของฉัน',
    'nav.ask':              '+ ถามโลก',
  },
}

export function getLang(channelId: string): Lang {
  return channelId === 'th' ? 'th' : 'global'
}

export function t(channelId: string, key: string): string {
  const lang = getLang(channelId)
  return translations[lang][key] ?? translations['global'][key] ?? key
}
