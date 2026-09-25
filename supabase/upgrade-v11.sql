-- upgrade-v11: ⭐ نجوم توكي + الموقع شبه مجاني
-- • نجوم توكي = رصيد مكالمات توكي الحقيقي (كل نجمة = دقيقة). الرصيد الحالي بيضل زي ما هو (واحد بواحد).
-- • المشترك بيكسب نجوم وهو بيتعلم: هدف اليوم = 1، كل 7 أيام ورا بعض = 3، نجاح بامتحان مستوى = 10.
-- • الطاقة المجانية اليومية لشات توكي بتصير 30 بدل 20 (إذا كانت لسا 20).
create table if not exists public.star_earnings (
  user_id uuid not null references auth.users(id) on delete cascade,
  reason text not null, ref text not null, amount int not null, created_at timestamptz not null default now(),
  primary key (user_id, reason, ref));
alter table public.star_earnings enable row level security;
drop policy if exists "own star earnings" on public.star_earnings;
create policy "own star earnings" on public.star_earnings for select using (auth.uid() = user_id);

create or replace function public.earn_stars(reason text, ref text)
returns json language plpgsql security definer set search_path = public as $$
declare u uuid := auth.uid(); amt int; bal int;
begin
  if u is null then return json_build_object('ok', false, 'error', 'not_signed_in'); end if;
  amt := case reason when 'goal' then 1 when 'streak' then 3 when 'level' then 10 else 0 end;
  if amt = 0 then return json_build_object('ok', false, 'error', 'bad_reason'); end if;
  if reason = 'level' and ref not in ('A1','A2','B1','B2','C1','C2') then return json_build_object('ok', false, 'error', 'bad_ref'); end if;
  if reason in ('goal','streak') and ref <> to_char(now() at time zone 'Asia/Gaza', 'YYYY-MM-DD')
     and ref <> to_char((now() at time zone 'Asia/Gaza') - interval '1 day', 'YYYY-MM-DD') then
    return json_build_object('ok', false, 'error', 'bad_date'); end if;
  insert into public.star_earnings(user_id, reason, ref, amount) values (u, reason, ref, amt) on conflict do nothing;
  if not found then return json_build_object('ok', true, 'added', 0); end if;
  update public.profiles set live_balance_sec = coalesce(live_balance_sec,0) + amt*60 where id = u returning live_balance_sec into bal;
  return json_build_object('ok', true, 'added', amt, 'balance_sec', bal);
end $$;
grant execute on function public.earn_stars(text, text) to authenticated;

update public.app_settings set value = '30' where key = 'free_daily_energy' and value = '20';
