// components/cosmos/DemographicRings.tsx
'use client';

interface RingData {
  label: string;
  a: number;
  b: number;
}

/**
 * Compact radial breakdown for the results stage. Each row is a small
 * donut ring split between option_1 (colorA) and option_2 (colorB).
 */
export function DemographicRings({
  title,
  rows,
  colorA,
  colorB,
  textColor,
  subColor,
  cardBg,
  borderColor,
}: {
  title: string;
  rows: RingData[];
  colorA: string;
  colorB: string;
  textColor: string;
  subColor: string;
  cardBg: string;
  borderColor: string;
}) {
  const visible = rows.filter((r) => r.a + r.b > 0);
  if (visible.length === 0) return null;

  return (
    <div
      style={{
        width: '100%',
        maxWidth: 380,
        background: cardBg,
        border: `1px solid ${borderColor}`,
        borderRadius: 20,
        padding: '20px 24px',
        backdropFilter: 'blur(12px)',
      }}
    >
      <p
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: subColor,
          marginBottom: 14,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}
      >
        {title}
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {visible.map((r) => (
          <Row
            key={r.label}
            row={r}
            colorA={colorA}
            colorB={colorB}
            textColor={textColor}
            subColor={subColor}
          />
        ))}
      </div>
    </div>
  );
}

function Row({
  row,
  colorA,
  colorB,
  textColor,
  subColor,
}: {
  row: RingData;
  colorA: string;
  colorB: string;
  textColor: string;
  subColor: string;
}) {
  const total = row.a + row.b;
  const pctA = Math.round((row.a / total) * 100);
  const pctB = 100 - pctA;
  const r = 22;
  const c = 2 * Math.PI * r;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
      <svg width="56" height="56" viewBox="0 0 56 56">
        <circle
          cx="28"
          cy="28"
          r={r}
          fill="none"
          stroke={colorA}
          strokeWidth="6"
          strokeDasharray={`${(c * pctA) / 100} ${c}`}
          strokeLinecap="round"
          transform="rotate(-90 28 28)"
        />
        <circle
          cx="28"
          cy="28"
          r={r}
          fill="none"
          stroke={colorB}
          strokeWidth="6"
          strokeDasharray={`${(c * pctB) / 100} ${c}`}
          strokeLinecap="round"
          transform={`rotate(${-90 + (360 * pctA) / 100} 28 28)`}
        />
      </svg>
      <div style={{ flex: 1 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginBottom: 2,
          }}
        >
          <span style={{ fontSize: 13, color: textColor, fontWeight: 500 }}>
            {row.label}
          </span>
          <span style={{ fontSize: 12, color: subColor }}>
            {total} {total === 1 ? 'vote' : 'votes'}
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 11, color: subColor }}>{pctA}%</span>
          <span style={{ fontSize: 11, color: subColor }}>{pctB}%</span>
        </div>
      </div>
    </div>
  );
}
