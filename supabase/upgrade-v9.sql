-- upgrade-v9: الموقع مجاني للكل — طاقة ⚡ مجانية بتتجدد بعد 24 ساعة من ما تخلص + رصيد مدفوع ما بينتهي
alter table public.profiles add column if not exists credit_balance int not null default 0;
alter table public.profiles add column if not exists free_used int not null default 0;
alter table public.profiles add column if not exists free_exhausted_at timestamptz;
alter table public.minute_packs add column if not exists kind text not null default 'minutes';
alter table public.minute_orders add column if not exists kind text not null default 'minutes';

insert into public.app_settings(key, value) values ('free_daily_energy', '20') on conflict (key) do nothing;
-- بدون تجربة بعد اليوم (الكل مجاني)
update public.app_settings set value = '0' where key = 'trial_days';

insert into public.minute_packs(name, minutes, price, sort, kind)
  select * from (values ('50 ⚡', 50, 5::numeric, 10, 'energy'), ('150 ⚡', 150, 12::numeric, 11, 'energy'), ('400 ⚡', 400, 25::numeric, 12, 'energy')) v
  where not exists (select 1 from public.minute_packs where kind = 'energy');

create or replace function public.admin_set_setting(k text, v text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if k not in ('trial_days','telegram_token','telegram_chat_id','ref_days','live_voice','live_daily_min','free_daily_energy') then raise exception 'bad_key'; end if;
  insert into public.app_settings(key, value) values (k, left(trim(v), 300)) on conflict (key) do update set value = excluded.value;
end $$;

create or replace function public.public_settings()
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'trial_days', coalesce((select nullif(value,'')::int from public.app_settings where key = 'trial_days'), 0),
    'free_daily_energy', coalesce((select nullif(value,'')::int from public.app_settings where key = 'free_daily_energy'), 20));
$$;
grant execute on function public.public_settings() to anon, authenticated;

-- قلب النظام: بيجدد المجاني إذا مر 24 ساعة من ما خلص، وبيخصم من المجاني أول وبعدين من الرصيد
create or replace function public.use_energy_for(u uuid, n int)
returns json language plpgsql security definer set search_path = public as $$
declare p public.profiles; q int; fl int; take_free int; ok boolean := true;
begin
  select * into p from public.profiles where id = u for update;
  if not found then return json_build_object('ok', false, 'error', 'no_profile'); end if;
  q := coalesce((select nullif(value,'')::int from public.app_settings where key = 'free_daily_energy'), 20);
  if p.role = 'admin' then return json_build_object('ok', true, 'unlimited', true, 'free_left', q, 'quota', q, 'balance', p.credit_balance); end if;
  if p.free_exhausted_at is not null and now() - p.free_exhausted_at >= interval '24 hours' then
    p.free_used := 0; p.free_exhausted_at := null;
  end if;
  n := greatest(coalesce(n, 0), 0);
  fl := greatest(q - p.free_used, 0);
  if n > 0 then
    if fl + p.credit_balance >= n then
      take_free := least(fl, n);
      p.free_used := p.free_used + take_free;
      p.credit_balance := p.credit_balance - (n - take_free);
    else
      ok := false;
    end if;
  end if;
  if p.free_used >= q and p.free_exhausted_at is null then p.free_exhausted_at := now(); end if;
  update public.profiles set free_used = p.free_used, free_exhausted_at = p.free_exhausted_at, credit_balance = p.credit_balance where id = u;
  return json_build_object('ok', ok, 'unlimited', false, 'free_left', greatest(q - p.free_used, 0), 'quota', q,
    'balance', p.credit_balance, 'reset_at', case when p.free_exhausted_at is null then null else p.free_exhausted_at + interval '24 hours' end);
end $$;
revoke execute on function public.use_energy_for(uuid, int) from public, anon, authenticated;

-- للموقع: يشوف طاقته (n=0) أو يصرف (n صغيرة، ما بتقدر تصرف أكثر من 3 مرة وحدة)
create or replace function public.use_energy(n int)
returns json language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'login'; end if;
  return public.use_energy_for(auth.uid(), least(greatest(coalesce(n,0),0), 3));
end $$;
grant execute on function public.use_energy(int) to authenticated;

-- طلبات الشحن صارت لنوعين: دقائق صوت أو طاقة
create or replace function public.request_minutes(pack int, meth text, ref text, proof text)
returns bigint language plpgsql security definer set search_path = public as $$
declare p public.minute_packs; n int; oid bigint; em text;
begin
  if auth.uid() is null then raise exception 'login'; end if;
  select * into p from public.minute_packs where id = pack and active;
  if not found then raise exception 'bad_pack'; end if;
  select count(*) into n from public.minute_orders where user_id = auth.uid() and status = 'pending';
  if n >= 3 then raise exception 'too_many_pending'; end if;
  insert into public.minute_orders(user_id, pack_id, minutes, amount, method, reference, proof_path, kind)
    values (auth.uid(), p.id, p.minutes, p.price, left(coalesce(meth,''), 40), left(coalesce(ref,''), 120), left(proof, 300), p.kind)
    returning id into oid;
  select email into em from public.profiles where id = auth.uid();
  begin perform public.tg_send((case when p.kind = 'energy' then '⚡ طلب شحن طاقة: ' else '🎙️ طلب شحن دقائق: ' end) || p.name || ' — ' || p.price || E'\n' || coalesce(em, '')); exception when others then null; end;
  return oid;
end $$;
grant execute on function public.request_minutes(int, text, text, text) to authenticated;

create or replace function public.approve_minutes(oid bigint)
returns void language plpgsql security definer set search_path = public as $$
declare o public.minute_orders;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  update public.minute_orders set status = 'approved', decided_at = now() where id = oid and status = 'pending' returning * into o;
  if not found then raise exception 'not_pending'; end if;
  if o.kind = 'energy' then
    update public.profiles set credit_balance = credit_balance + o.minutes where id = o.user_id;
  else
    update public.profiles set live_balance_sec = live_balance_sec + o.minutes * 60 where id = o.user_id;
  end if;
end $$;
grant execute on function public.approve_minutes(bigint) to authenticated;

create or replace function public.admin_gift_energy(u uuid, amt int)
returns int language plpgsql security definer set search_path = public as $$
declare b int;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  update public.profiles set credit_balance = greatest(0, credit_balance + amt) where id = u returning credit_balance into b;
  return b;
end $$;
grant execute on function public.admin_gift_energy(uuid, int) to authenticated;
