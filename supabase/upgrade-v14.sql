-- upgrade-v14: 🔔 إشعارات التذكير (آمن تشغيله أكثر من مرة)
-- المفاتيح بيولّدها السيرفر لحاله أول مرة وبتنحفظ هون (ما حدا بيقدر يقرأها غير السيرفر)
create table if not exists public.push_keys (id int primary key, public_key text not null, private_key text not null, cron_key text not null, created_at timestamptz not null default now());
alter table public.push_keys enable row level security;

create table if not exists public.push_subs (
  endpoint text primary key, user_id uuid not null references auth.users(id) on delete cascade,
  p256dh text not null, auth text not null, lang text, tz int not null default 0, last_sent date,
  created_at timestamptz not null default now());
alter table public.push_subs enable row level security;
drop policy if exists "own subs select" on public.push_subs;
drop policy if exists "own subs insert" on public.push_subs;
drop policy if exists "own subs update" on public.push_subs;
drop policy if exists "own subs delete" on public.push_subs;
create policy "own subs select" on public.push_subs for select using (auth.uid() = user_id);
create policy "own subs insert" on public.push_subs for insert with check (auth.uid() = user_id);
create policy "own subs update" on public.push_subs for update using (auth.uid() = user_id);
create policy "own subs delete" on public.push_subs for delete using (auth.uid() = user_id);

-- جدولة: كل ساعة، السيرفر بيشوف مين لازم يتذكّر
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;
do $$ begin perform cron.unschedule('speakup-push'); exception when others then null; end $$;
select cron.schedule('speakup-push', '5 * * * *', $cron$
  select net.http_post(
    url := 'https://jqimkyqszlwnndddizkf.supabase.co/functions/v1/tutor',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpxaW1reXFzemx3bm5kZGRpemtmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk4NDIyNTgsImV4cCI6MjEwNTQxODI1OH0.i6NypjJZt2qt8Dqgyd0ONrqFa5_gTF5e5BhvyWT9C54','x-cron-key', coalesce((select cron_key from public.push_keys where id = 1), 'none')),
    body := '{"action":"push_cron"}'::jsonb)
$cron$);
