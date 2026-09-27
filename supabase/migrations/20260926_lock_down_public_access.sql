-- Majority — lock down what the public (anon) key can see and do.
-- Run once in Supabase → SQL Editor. Safe to re-run.
--
-- Before: the anon key could read every voter's IP + fingerprint and every
-- creator's email + IP. All writes already go through server routes using the
-- service role key (which bypasses RLS), so the browser only needs to READ a
-- few non-sensitive columns.

begin;

-- 1. RLS on everything
alter table public.polls            enable row level security;
alter table public.votes            enable row level security;
alter table public.reports          enable row level security;
alter table public.dashboard_tokens enable row level security;

-- 2. Drop whatever policies exist today (names unknown / may be permissive)
do $$
declare r record;
begin
  for r in
    select policyname, tablename from pg_policies
    where schemaname = 'public'
      and tablename in ('polls', 'votes', 'reports', 'dashboard_tokens')
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- 3. Read-only policies for the browser
create policy "public read polls" on public.polls
  for select to anon, authenticated using (true);
create policy "public read votes" on public.votes
  for select to anon, authenticated using (true);

-- 4. Column-level access: only non-identifying columns are visible
revoke all on public.polls, public.votes, public.reports, public.dashboard_tokens from anon, authenticated;

grant select (id, question, option_1, option_2, is_active, is_archived, created_at, expires_at, channel)
  on public.polls to anon, authenticated;

grant select (id, poll_id, choice, voter_age, voter_gender, voter_country, voted_at)
  on public.votes to anon, authenticated;

-- 5. Live vote counter now uses Realtime Broadcast from the server, so the
--    votes table no longer needs to stream raw rows to browsers.
do $$
begin
  alter publication supabase_realtime drop table public.votes;
exception when others then null; -- not in the publication
end $$;

-- 6. One report per person (stops a single visitor hiding any poll)
alter table public.reports add column if not exists reporter text;
create unique index if not exists reports_poll_reporter_uniq on public.reports (poll_id, reporter);

-- 7. Fast lookups used by the vote routes
create index if not exists votes_poll_fingerprint_idx on public.votes (poll_id, fingerprint);
create index if not exists votes_poll_ip_idx          on public.votes (poll_id, ip_address);

commit;
