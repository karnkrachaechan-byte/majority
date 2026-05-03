// app/page.tsx
//
// Home page — Cosmos orbit. Replaces the wrap-grid version.
// Same data layer (Supabase polls + votes), same Next.js App Router.

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { CosmosScene } from '@/components/cosmos/CosmosScene';
import { useDayNight } from '@/components/cosmos/useDayNight';
import type { PollWithVotes, VoteTotals } from '@/components/cosmos/types';

export default function Home() {
  const router = useRouter();
  const day = useDayNight();
  const [polls, setPolls] = useState<PollWithVotes[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchPolls() {
      const { data: pollData } = await supabase
        .from('polls')
        .select('id, question, option_1, option_2, expires_at')
        .eq('is_active', true)
        .or('expires_at.is.null,expires_at.gt.' + new Date().toISOString())
        .order('created_at', { ascending: false });

      if (!pollData || pollData.length === 0) {
        setPolls([]);
        setLoading(false);
        return;
      }

      const ids = pollData.map((p) => p.id);
      const { data: voteData } = await supabase
        .from('votes')
        .select('poll_id, choice')
        .in('poll_id', ids);

      const totalsByPoll: Record<string, VoteTotals> = {};
      voteData?.forEach((v) => {
        const t = totalsByPoll[v.poll_id] ?? { a: 0, b: 0, total: 0 };
        if (v.choice === 1) t.a++;
        if (v.choice === 2) t.b++;
        t.total = t.a + t.b;
        totalsByPoll[v.poll_id] = t;
      });

      setPolls(
        pollData.map((p) => {
          const totals = totalsByPoll[p.id] ?? { a: 0, b: 0, total: 0 };
          return { ...p, voteCount: totals.total, totals };
        })
      );
      setLoading(false);
    }
    fetchPolls();
  }, []);

  const textColor = day ? '#1a1a2e' : '#f0f0f8';
  const subColor = day ? '#5a5a6e' : '#9a9aae';

  return (
    <div className="cosmos-stage">
      {/* Header (kept identical to original) */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 100,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '20px 28px',
          pointerEvents: 'none',
        }}
      >
        <div style={{ pointerEvents: 'auto' }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: textColor, margin: 0 }}>
            Majority
          </h1>
          <p style={{ fontSize: 13, color: subColor, margin: 0 }}>
            What does the world think?
          </p>
        </div>
        <div
          style={{ display: 'flex', gap: 10, alignItems: 'center', pointerEvents: 'auto' }}
        >
          <a
            href="/dashboard/request"
            style={{
              color: subColor,
              fontSize: 13,
              fontWeight: 500,
              textDecoration: 'none',
              padding: '10px 16px',
            }}
          >
            My polls
          </a>
          <a
            href="/create"
            style={{
              background: day ? '#111' : '#f0f0f0',
              color: day ? '#fff' : '#111',
              padding: '10px 20px',
              borderRadius: 100,
              fontSize: 13,
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            + New Poll
          </a>
        </div>
      </div>

      {loading ? (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: subColor,
            fontSize: 15,
          }}
        >
          Loading...
        </div>
      ) : polls.length === 0 ? (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            color: subColor,
            fontSize: 15,
            gap: 8,
          }}
        >
          <p style={{ margin: 0 }}>No polls yet.</p>
          <p style={{ margin: 0, fontSize: 13 }}>Be the first to create one!</p>
        </div>
      ) : (
        <CosmosScene
          polls={polls}
          onPollClick={(id) => router.push(`/poll/${id}`)}
          showHint
        />
      )}
    </div>
  );
}
