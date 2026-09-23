-- upgrade-v10: الطاقة المجانية بتتجدد كل يوم حتى لو ما خلصت (وما بتتجمّع)
-- • إذا خلصت الـ ⚡ المجانية كلها: بترجع كاملة بعد 24 ساعة من ما خلصت.
-- • إذا صرف جزء بس: بترجع كاملة بعد 24 ساعة من أول ما بلّش يصرف.
-- • أقصى إشي دايماً = الرقم اليومي (ما بتتجمّع). الرصيد المشحون ما بيتأثر.
alter table public.profiles add column if not exists free_started_at timestamptz;

create or replace function public.use_energy_for(u uuid, n int)
returns json language plpgsql security definer set search_path = public as $$
declare p public.profiles; q int; fl int; take_free int; ok boolean := true;
begin
  select * into p from public.profiles where id = u for update;
  if not found then return json_build_object('ok', false, 'error', 'no_profile'); end if;
  q := coalesce((select nullif(value,'')::int from public.app_settings where key = 'free_daily_energy'), 20);
  if p.role = 'admin' then return json_build_object('ok', true, 'unlimited', true, 'free_left', q, 'quota', q, 'balance', p.credit_balance); end if;

  if (p.free_exhausted_at is not null and now() - p.free_exhausted_at >= interval '24 hours')
     or (p.free_exhausted_at is null and p.free_started_at is not null and now() - p.free_started_at >= interval '24 hours') then
    p.free_used := 0; p.free_exhausted_at := null; p.free_started_at := null;
  end if;

  n := greatest(coalesce(n, 0), 0);
  fl := greatest(q - p.free_used, 0);
  if n > 0 then
    if fl + p.credit_balance >= n then
      take_free := least(fl, n);
      if take_free > 0 and p.free_used = 0 then p.free_started_at := now(); end if;
      p.free_used := p.free_used + take_free;
      p.credit_balance := p.credit_balance - (n - take_free);
    else
      ok := false;
    end if;
  end if;
  if p.free_used >= q and p.free_exhausted_at is null then p.free_exhausted_at := now(); end if;

  update public.profiles set free_used = p.free_used, free_exhausted_at = p.free_exhausted_at,
         free_started_at = p.free_started_at, credit_balance = p.credit_balance where id = u;
  return json_build_object('ok', ok, 'unlimited', false, 'free_left', greatest(q - p.free_used, 0), 'quota', q,
    'balance', p.credit_balance,
    'reset_at', case when p.free_exhausted_at is not null then p.free_exhausted_at + interval '24 hours'
                     when p.free_started_at is not null then p.free_started_at + interval '24 hours' else null end);
end $$;
revoke execute on function public.use_energy_for(uuid, int) from public, anon, authenticated;
