-- upgrade-v13: 📈 لوحة الأرقام للأدمن (مستخدمين، نشاط، رجوع، دخل، لغات، مستويات، مصادر الزيارات)
create or replace function public.admin_dash(days int default 30)
returns json language plpgsql security definer set search_path = public as $$
declare since date := current_date - greatest(1, least(coalesce(days,30), 365)) + 1; r json;
begin
  if not public.is_admin() then raise exception 'not admin'; end if;
  select json_build_object(
    'users_total',  (select count(*) from profiles),
    'new_today',    (select count(*) from profiles where created_at::date = current_date),
    'new_period',   (select count(*) from profiles where created_at::date >= since),
    'active_today', (select count(*) from profiles where updated_at::date = current_date),
    'active_7d',    (select count(*) from profiles where updated_at >= now() - interval '7 days'),
    'active_30d',   (select count(*) from profiles where updated_at >= now() - interval '30 days'),
    'ret_d1', (select round(100.0 * count(*) filter (where updated_at >= created_at + interval '1 day') / nullif(count(*),0))
               from profiles where created_at < now() - interval '1 day' and created_at >= now() - interval '31 days'),
    'ret_d7', (select round(100.0 * count(*) filter (where updated_at >= created_at + interval '7 days') / nullif(count(*),0))
               from profiles where created_at < now() - interval '7 days' and created_at >= now() - interval '37 days'),
    'visits_period',  (select count(*) from visits where day >= since),
    'revenue_period', (select coalesce(sum(amount),0) from minute_orders where status = 'approved' and created_at::date >= since),
    'revenue_all',    (select coalesce(sum(amount),0) from minute_orders where status = 'approved'),
    'rev_energy',     (select coalesce(sum(amount),0) from minute_orders where status = 'approved' and created_at::date >= since and coalesce(kind,'minutes') = 'energy'),
    'rev_stars',      (select coalesce(sum(amount),0) from minute_orders where status = 'approved' and created_at::date >= since and coalesce(kind,'minutes') <> 'energy'),
    'orders_pending', (select count(*) from minute_orders where status = 'pending'),
    'buyers_period',  (select count(distinct user_id) from minute_orders where status = 'approved' and created_at::date >= since),
    'ai_calls_period',(select coalesce(sum(count),0) from ai_usage where day >= since),
    'ai_users_period',(select count(distinct user_id) from ai_usage where day >= since),
    'live_min_period',(select coalesce(round(sum(coalesce(used_sec,0)) / 60.0),0) from live_sessions where day >= since),
    'stars_earned_period', (select coalesce(sum(amount),0) from star_earnings where created_at::date >= since),
    'langs',   (select coalesce(json_object_agg(l, n), '{}'::json) from (select coalesce(progress->'meta'->>'cur','en') l, count(*) n from profiles group by 1) t),
    'levels',  (select coalesce(json_object_agg(lv, n), '{}'::json) from (select coalesce(nullif(level,''),'—') lv, count(*) n from profiles group by 1) t),
    'sources', (select coalesce(json_agg(t), '[]'::json) from (select coalesce(nullif(source,''),'مباشر') s, count(*) n from visits where day >= since group by 1 order by 2 desc limit 8) t),
    'devices', (select coalesce(json_object_agg(dv, n), '{}'::json) from (select coalesce(device,'?') dv, count(*) n from visits where day >= since group by 1) t),
    'daily', (select coalesce(json_agg(t order by d), '[]'::json) from (
        select g::date d,
          (select count(*) from visits v where v.day = g::date) visits,
          (select count(*) from profiles p where p.created_at::date = g::date) signups,
          (select count(distinct a.user_id) from ai_usage a where a.day = g::date) ai_users,
          (select coalesce(sum(o.amount),0) from minute_orders o where o.status = 'approved' and o.created_at::date = g::date) revenue
        from generate_series(since::timestamp, current_date::timestamp, interval '1 day') g) t)
  ) into r;
  return r;
end $$;
grant execute on function public.admin_dash(int) to authenticated;
