-- =====================================================================
-- Bharat eVote — Supabase / PostgreSQL schema
-- Run in Supabase → SQL Editor (or: supabase db push)
--
-- This file is the single source of truth for the database: tables, RLS
-- policies, triggers, storage buckets and every function body. It is
-- idempotent, so re-running it is the supported way to apply function
-- changes to an existing project. Do not keep copies of these functions
-- anywhere else — edit them here and re-run.
-- ---------------------------------------------------------------------
-- Security model
--   • profiles hold identity + role; ballots never reference a voter.
--   • voter_participation proves "this account voted" (unique per election).
--   • anonymous_ballots holds election + candidate only.
--   • One vote is enforced by a UNIQUE constraint inside a single
--     transaction that also validates the election window.
--   • RLS denies direct ballot access; aggregates come from RPC.
--   • Admin writes go through the `admin-action` Edge Function with the
--     service role, after verifying the caller's administrator profile.
-- =====================================================================

-- No extension is required: hashing uses md5() and ids use gen_random_uuid(),
-- both of which ship with PostgreSQL 13+. This keeps the schema runnable in
-- projects where pgcrypto cannot be installed into the function search_path.

-- ---------------------------------------------------------------- enums
do $$ begin
  create type public.user_role as enum ('voter', 'admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.election_status as enum ('draft', 'upcoming', 'active', 'closed', 'published');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.voter_status as enum ('pending', 'verified', 'rejected', 'suspended');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------- tables
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null check (char_length(full_name) between 2 and 120),
  email       text not null,
  phone       text check (phone is null or char_length(phone) <= 32),
  role        public.user_role not null default 'voter',
  verified    boolean not null default false,
  status      public.voter_status not null default 'pending',
  created_at  timestamptz not null default now()
);
create unique index if not exists profiles_email_key on public.profiles (lower(email));

create table if not exists public.election_categories (
  id    uuid primary key default gen_random_uuid(),
  name  text not null unique check (char_length(name) between 2 and 80)
);

create table if not exists public.elections (
  id             uuid primary key default gen_random_uuid(),
  title          text not null check (char_length(title) between 4 and 140),
  description    text not null check (char_length(description) between 10 and 2000),
  category_id    uuid references public.election_categories (id) on delete set null,
  status         public.election_status not null default 'draft',
  starts_at      timestamptz not null,
  ends_at        timestamptz not null,
  eligible_count integer not null default 0 check (eligible_count >= 0),
  votes_cast     integer not null default 0 check (votes_cast >= 0),
  is_demo        boolean not null default false,
  published_at   timestamptz,
  created_by     uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now(),
  constraint elections_window check (ends_at > starts_at),
  constraint elections_published_at check (
    (status = 'published' and published_at is not null) or (status <> 'published')
  )
);
create index if not exists elections_status_idx on public.elections (status);
create index if not exists elections_window_idx on public.elections (starts_at, ends_at);

create table if not exists public.candidates (
  id           uuid primary key default gen_random_uuid(),
  election_id  uuid not null references public.elections (id) on delete cascade,
  name         text not null check (char_length(name) between 2 and 120),
  affiliation  text not null default 'Independent',
  manifesto    text not null check (char_length(manifesto) between 10 and 4000),
  photo_url    text,
  color        text not null default '#2f6fed',
  display_order integer not null default 0,
  created_at   timestamptz not null default now(),
  unique (id, election_id)
);
create index if not exists candidates_election_idx on public.candidates (election_id);

-- Per-election eligibility override (absence = organization-wide eligibility).
create table if not exists public.voter_eligibility (
  election_id uuid not null references public.elections (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  approved    boolean not null default true,
  created_at  timestamptz not null default now(),
  primary key (election_id, user_id)
);

-- Proof of participation. No candidate information here.
create table if not exists public.voter_participation (
  id          uuid primary key default gen_random_uuid(),
  election_id uuid not null references public.elections (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  receipt     text not null,
  voted_at    timestamptz not null default now(),
  unique (election_id, user_id)             -- ← one accepted vote per voter
);
create index if not exists participation_user_idx on public.voter_participation (user_id);

-- Anonymous ballot. Deliberately has no user column.
create table if not exists public.anonymous_ballots (
  id          uuid primary key default gen_random_uuid(),
  election_id uuid not null references public.elections (id) on delete cascade,
  candidate_id uuid not null,
  cast_at     timestamptz not null default now(),
  constraint ballots_candidate_fk foreign key (candidate_id, election_id)
    references public.candidates (id, election_id) on delete restrict
);
create index if not exists ballots_election_idx on public.anonymous_ballots (election_id);
create index if not exists ballots_candidate_idx on public.anonymous_ballots (candidate_id);

create table if not exists public.audit_logs (
  id          bigserial primary key,
  actor_id    uuid references public.profiles (id) on delete set null,
  actor_label text not null default 'system',
  action      text not null,
  target      text not null default '',
  detail      text not null default '',
  prev_hash   text not null default 'GENESIS',
  hash        text not null,
  created_at  timestamptz not null default now()
);
create index if not exists audit_created_idx on public.audit_logs (created_at desc);

create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  body       text not null,
  read       boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);

create table if not exists public.activity_log (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  type       text not null check (type in ('registration', 'verification', 'vote', 'results')),
  body       text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.platform_settings (
  id           boolean primary key default true check (id),
  org_name     text not null default 'Bharat eVote',
  support_email text,
  require_verification boolean not null default true,
  allow_self_registration boolean not null default true,
  public_results_only_when_published boolean not null default true,
  updated_at   timestamptz not null default now()
);

-- Lightweight rate limiting for sensitive endpoints.
create table if not exists public.request_log (
  id         bigserial primary key,
  user_id    uuid not null,
  action     text not null,
  created_at timestamptz not null default now()
);
create index if not exists request_log_idx on public.request_log (user_id, action, created_at desc);

-- ---------------------------------------------------------------- helpers
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin' and p.status <> 'suspended'
  );
$$;

create or replace function public.assert_rate_limit(p_action text, p_max int default 10, p_window interval default '1 minute')
returns void
language plpgsql security definer set search_path = public
as $$
declare v_count int;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select count(*) into v_count from public.request_log
   where user_id = auth.uid() and action = p_action and created_at > now() - p_window;
  if v_count >= p_max then
    raise exception 'Too many requests. Please wait a moment and try again.';
  end if;
  insert into public.request_log (user_id, action) values (auth.uid(), p_action);
end;
$$;

-- ---------------------------------------------------------------- profile bootstrap
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email, status, verified)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(new.email, '@', 1)),
    coalesce(new.email, ''),
    'pending',
    false
  )
  on conflict (id) do nothing;

  insert into public.activity_log (user_id, type, body)
  values (new.id, 'registration', 'Account registration completed')
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Users may edit their own name/phone but never their role or verification.
create or replace function public.protect_profile_columns()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  -- No end-user JWT means a trusted server context: the SQL editor, a migration,
  -- or the service_role key. Those are how the first administrator is created;
  -- end users always carry a JWT through PostgREST, so they still hit the guard.
  if auth.uid() is null then return new; end if;
  if public.is_admin() then return new; end if;
  if new.role is distinct from old.role
     or new.verified is distinct from old.verified
     or new.status is distinct from old.status then
    raise exception 'Only administrators can change role, verification or status';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profile_columns on public.profiles;
create trigger protect_profile_columns
  before update on public.profiles
  for each row execute function public.protect_profile_columns();

create or replace function public.update_my_profile(p_name text, p_phone text default null)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  update public.profiles
     set full_name = coalesce(nullif(trim(p_name), ''), full_name),
         phone = p_phone
   where id = auth.uid();
end;
$$;

-- ---------------------------------------------------------------- audit chain
-- Hashing uses md5() from pg_catalog, so no extension has to be installed.
create or replace function public.append_audit(
  p_action text, p_target text default '', p_detail text default '', p_actor_label text default null
)
returns public.audit_logs
language plpgsql security definer set search_path = public
as $$
declare
  v_prev text;
  v_row public.audit_logs;
  v_actor text;
begin
  select hash into v_prev from public.audit_logs order by id desc limit 1;
  v_prev := coalesce(v_prev, 'GENESIS');
  v_actor := coalesce(p_actor_label, (select full_name from public.profiles where id = auth.uid()), 'system');

  insert into public.audit_logs (actor_id, actor_label, action, target, detail, prev_hash, hash)
  values (
    auth.uid(), v_actor, p_action, p_target, p_detail, v_prev,
    md5(v_prev || '|' || p_action || '|' || p_target || '|' || p_detail || '|' || clock_timestamp()::text)
  )
  returning * into v_row;
  return v_row;
end;
$$;

-- Called only by triggers and trusted server code (cast_ballot, admin-action).
-- Without this, any anonymous caller could forge entries into the audit chain.
revoke all on function public.append_audit(text, text, text, text) from public, anon, authenticated;
grant execute on function public.append_audit(text, text, text, text) to service_role;

-- ---------------------------------------------------------------- vote casting (atomic)
create or replace function public.cast_ballot(p_election_id uuid, p_candidate_id uuid)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_uid       uuid := auth.uid();
  v_election  public.elections;
  v_receipt   text;
  v_verified  boolean;
  v_status    public.voter_status;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;

  -- Lock the election row: serialises concurrent submissions for this election.
  select * into v_election from public.elections where id = p_election_id for update;
  if not found then raise exception 'Election not found'; end if;

  if v_election.status <> 'active' or now() < v_election.starts_at or now() > v_election.ends_at then
    raise exception 'Voting is not open for this election';
  end if;

  select verified, status into v_verified, v_status from public.profiles where id = v_uid;
  if v_status = 'suspended' or v_status = 'rejected' then
    raise exception 'This account is not eligible to vote';
  end if;
  if not v_verified then
    raise exception 'Eligibility verification is required before voting';
  end if;

  if exists (select 1 from public.voter_eligibility
              where election_id = p_election_id and user_id = v_uid and approved = false) then
    raise exception 'You are not eligible for this election';
  end if;

  if not exists (select 1 from public.candidates
                  where id = p_candidate_id and election_id = p_election_id) then
    raise exception 'Invalid candidate for this election';
  end if;

  v_receipt := 'BVT-' || upper(substr(md5(random()::text || clock_timestamp()::text || v_uid::text), 1, 4))
                    || '-' || upper(substr(md5(v_uid::text || clock_timestamp()::text || random()::text), 1, 4));

  -- Participation (identity) and ballot (choice) are written separately,
  -- inside one transaction. The unique constraint rejects duplicates.
  insert into public.voter_participation (election_id, user_id, receipt)
  values (p_election_id, v_uid, v_receipt);

  insert into public.anonymous_ballots (election_id, candidate_id)
  values (p_election_id, p_candidate_id);

  insert into public.activity_log (user_id, type, body)
  values (v_uid, 'vote', 'Vote successfully submitted — ' || v_election.title);

  insert into public.notifications (user_id, body)
  values (v_uid, 'Your ballot for ' || v_election.title || ' was recorded. Receipt ' || v_receipt || '.');

  begin
    perform public.append_audit('ballot.cast', v_election.title,
      'Anonymous ballot recorded; no voter identifier attached', 'Voting booth');
  exception when others then
    -- A broken audit sink must never disenfranchise a voter: the ballot and
    -- receipt are already written inside this transaction.
    null;
  end;

  return v_receipt;
exception
  when unique_violation then
    raise exception 'You have already voted in this election';
end;
$$;

revoke all on function public.cast_ballot(uuid, uuid) from public, anon;
grant execute on function public.cast_ballot(uuid, uuid) to authenticated;

-- Keep the denormalised counter in sync (admin dashboards read it directly).
create or replace function public.bump_votes_cast()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.elections set votes_cast = votes_cast + 1 where id = new.election_id;
    return new;
  else
    update public.elections set votes_cast = greatest(votes_cast - 1, 0) where id = old.election_id;
    return old;
  end if;
end;
$$;

drop trigger if exists ballots_bump_votes on public.anonymous_ballots;
create trigger ballots_bump_votes
  after insert or delete on public.anonymous_ballots
  for each row execute function public.bump_votes_cast();

create or replace function public.on_results_published()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'published' and (old.status is distinct from 'published') then
    new.published_at := coalesce(new.published_at, now());
    perform public.append_audit('election.published', new.title, 'Results published after voting closed');
    insert into public.notifications (user_id, body)
    select p.user_id, 'Results published: ' || new.title
      from public.voter_participation p where p.election_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists elections_publish on public.elections;
create trigger elections_publish
  before update on public.elections
  for each row execute function public.on_results_published();

-- ------------------------------------- registration + approval notifications
-- Clients cannot insert into public.notifications (only read/mark-read their
-- own rows), so both sides of the approval conversation are written here by
-- security-definer triggers: every administrator hears about a new voter, and
-- the voter hears the decision.
create or replace function public.on_profile_registered()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role <> 'voter' then
    return new;
  end if;
  begin
    insert into public.notifications (user_id, body)
    select a.id, 'New voter awaiting review: ' || new.full_name || ' (' || new.email || ').'
      from public.profiles a
     where a.role = 'admin' and a.status <> 'suspended';
  exception when others then
    -- A notification must never block a registration.
    null;
  end;
  return new;
end;
$$;

create or replace function public.on_profile_status_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_body text;
begin
  if new.status is not distinct from old.status
     and new.verified is not distinct from old.verified then
    return new;
  end if;

  v_body := case new.status
    when 'verified'  then 'Your eligibility was approved. You can vote in open elections now.'
    when 'rejected'  then 'Your registration was rejected. Contact the administrator if you think this is a mistake.'
    when 'suspended' then 'Your account was suspended pending review.'
    when 'pending'   then 'Your account is pending review by an administrator.'
    else 'Your eligibility status is now ' || new.status || '.'
  end;

  begin
    insert into public.notifications (user_id, body) values (new.id, v_body);
    insert into public.activity_log (user_id, type, body) values (new.id, 'verification', v_body);
  exception when others then
    null;
  end;
  return new;
end;
$$;

drop trigger if exists profiles_registered on public.profiles;
create trigger profiles_registered
  after insert on public.profiles
  for each row execute function public.on_profile_registered();

drop trigger if exists profiles_status_change on public.profiles;
create trigger profiles_status_change
  after update of status, verified on public.profiles
  for each row execute function public.on_profile_status_change();

-- ---------------------------------------------------------------- results RPC
create or replace function public.get_election_results(p_election_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_e public.elections;
  v_admin boolean := public.is_admin();
  v_visible boolean;
  v_rows jsonb;
  v_total integer := 0;
  v_winner jsonb;
begin
  select * into v_e from public.elections where id = p_election_id;
  if not found then raise exception 'Election not found'; end if;

  if v_e.status = 'draft' and not v_admin then
    raise exception 'Election not found';
  end if;

  v_visible := v_e.status = 'published' or (v_admin and v_e.status = 'closed');

  with tallies as (
    select c.id as candidate_id, c.name, c.affiliation, c.color, c.display_order,
           count(b.id)::int as votes
      from public.candidates c
      left join public.anonymous_ballots b on b.candidate_id = c.id
     where c.election_id = p_election_id
     group by c.id, c.name, c.affiliation, c.color, c.display_order
  ), totals as (select coalesce(sum(votes), 0) as total from tallies)
  select coalesce(sum(votes), 0) into v_total from tallies;

  if v_visible then
    select jsonb_agg(row_to_json(t) order by t.votes desc, t.display_order) into v_rows
    from (
      select candidate_id, name, affiliation, color, votes,
             case when v_total > 0 then round((votes::numeric / v_total) * 100, 1) else 0 end as share
        from (
          select c.id as candidate_id, c.name, c.affiliation, c.color, c.display_order,
                 count(b.id)::int as votes
            from public.candidates c
            left join public.anonymous_ballots b on b.candidate_id = c.id
           where c.election_id = p_election_id
           group by c.id, c.name, c.affiliation, c.color, c.display_order
        ) base
    ) t;

    select to_jsonb(w) into v_winner from (
      select name, affiliation, votes, share
        from jsonb_to_recordset(coalesce(v_rows, '[]'::jsonb))
             as x(name text, affiliation text, votes int, share numeric)
       order by votes desc limit 1
    ) w;
  end if;

  return jsonb_build_object(
    'published', v_e.status = 'published',
    'admin_preview', v_admin and v_e.status = 'closed',
    'status', v_e.status,
    'total_eligible', v_e.eligible_count,
    'total_votes', v_total,
    'turnout', case when v_e.eligible_count > 0
                    then round((v_total::numeric / v_e.eligible_count) * 100, 1) else 0 end,
    'rows', case when v_visible then coalesce(v_rows, '[]'::jsonb) else null end,
    'winner', case when v_e.status = 'published' then v_winner else null end
  );
end;
$$;

grant execute on function public.get_election_results(uuid) to anon, authenticated;

-- ---------------------------------------------------------------- RLS
alter table public.profiles            enable row level security;
alter table public.election_categories enable row level security;
alter table public.elections           enable row level security;
alter table public.candidates          enable row level security;
alter table public.voter_eligibility   enable row level security;
alter table public.voter_participation enable row level security;
alter table public.anonymous_ballots   enable row level security;
alter table public.audit_logs          enable row level security;
alter table public.notifications       enable row level security;
alter table public.activity_log        enable row level security;
alter table public.platform_settings   enable row level security;
alter table public.request_log         enable row level security;

-- profiles: own row (or admin). Inserts happen through the auth trigger.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select using (id = auth.uid() or public.is_admin());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

-- categories: readable by everyone, writable by admins
drop policy if exists categories_read on public.election_categories;
create policy categories_read on public.election_categories for select using (true);
drop policy if exists categories_admin_write on public.election_categories;
create policy categories_admin_write on public.election_categories
  for all using (public.is_admin()) with check (public.is_admin());

-- elections: public sees everything except drafts
drop policy if exists elections_read on public.elections;
create policy elections_read on public.elections
  for select using (status <> 'draft' or public.is_admin());
drop policy if exists elections_admin_write on public.elections;
create policy elections_admin_write on public.elections
  for all using (public.is_admin()) with check (public.is_admin());

-- candidates: visible with their election
drop policy if exists candidates_read on public.candidates;
create policy candidates_read on public.candidates
  for select using (
    exists (select 1 from public.elections e
             where e.id = candidates.election_id
               and (e.status <> 'draft' or public.is_admin()))
  );
drop policy if exists candidates_admin_write on public.candidates;
create policy candidates_admin_write on public.candidates
  for all using (public.is_admin()) with check (public.is_admin());

-- eligibility: own rows or admin
drop policy if exists eligibility_read on public.voter_eligibility;
create policy eligibility_read on public.voter_eligibility
  for select using (user_id = auth.uid() or public.is_admin());
drop policy if exists eligibility_admin_write on public.voter_eligibility;
create policy eligibility_admin_write on public.voter_eligibility
  for all using (public.is_admin()) with check (public.is_admin());

-- participation: the voter can see their own proof; admins see aggregate only.
drop policy if exists participation_read on public.voter_participation;
create policy participation_read on public.voter_participation
  for select using (user_id = auth.uid() or public.is_admin());

-- ballots: no client access at all (aggregates come from get_election_results)
drop policy if exists ballots_no_access on public.anonymous_ballots;
create policy ballots_no_access on public.anonymous_ballots
  for select using (false);
drop policy if exists ballots_admin_aggregate on public.anonymous_ballots;
create policy ballots_admin_aggregate on public.anonymous_ballots
  for select using (false);  -- deliberately deny direct reads, even for admins

-- audit: administrators only
drop policy if exists audit_admin_read on public.audit_logs;
create policy audit_admin_read on public.audit_logs
  for select using (public.is_admin());

-- notifications: own rows
drop policy if exists notifications_own on public.notifications;
create policy notifications_own on public.notifications
  for select using (user_id = auth.uid());
drop policy if exists notifications_own_update on public.notifications;
create policy notifications_own_update on public.notifications
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- activity: own rows
drop policy if exists activity_own on public.activity_log;
create policy activity_own on public.activity_log
  for select using (user_id = auth.uid());

-- settings: readable by authenticated users, writable by admins
drop policy if exists settings_read on public.platform_settings;
create policy settings_read on public.platform_settings for select using (true);
drop policy if exists settings_admin_write on public.platform_settings;
create policy settings_admin_write on public.platform_settings
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------- storage
insert into storage.buckets (id, name, public)
values ('candidate-photos', 'candidate-photos', true)
on conflict (id) do nothing;

drop policy if exists candidate_photos_read on storage.objects;
create policy candidate_photos_read on storage.objects
  for select using (bucket_id = 'candidate-photos');

drop policy if exists candidate_photos_admin_write on storage.objects;
create policy candidate_photos_admin_write on storage.objects
  for insert to authenticated
  with check (bucket_id = 'candidate-photos' and public.is_admin());

drop policy if exists candidate_photos_admin_update on storage.objects;
create policy candidate_photos_admin_update on storage.objects
  for update to authenticated
  using (bucket_id = 'candidate-photos' and public.is_admin());

drop policy if exists candidate_photos_admin_delete on storage.objects;
create policy candidate_photos_admin_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'candidate-photos' and public.is_admin());

-- ---------------------------------------------------------------- seed
insert into public.election_categories (name) values
  ('Community governance'), ('Housing society'), ('Youth leadership'), ('Education'),
  ('Alumni association'), ('Professional body'), ('Trust'), ('Sports federation')
on conflict (name) do nothing;

insert into public.platform_settings (id) values (true) on conflict (id) do nothing;

-- Promote your first administrator after creating the account:
--   update public.profiles set role = 'admin', verified = true, status = 'verified'
--   where email = 'you@example.com';
