-- =====================================================================
--  تحديث 003: النواقص والجرد بأسطر حرة (بدون قائمة أصناف) + صور المنتجات
--  شغّله مرة وحدة بعد 002 من: Supabase → SQL Editor → New query
--  آمن لإعادة التشغيل، وما يحذف أي بيانات.
-- =====================================================================

-- أسطر الجرد الحرة
alter table public.stock_counts add column if not exists extras jsonb not null default '[]'::jsonb;

-- صور النواقص: تنحفظ مضغوطة، وتنحذف تلقائياً بعد 45 يوم
create table if not exists public.shortage_photos (
  id         uuid primary key default gen_random_uuid(),
  branch_id  text references public.branches(id) on delete cascade,
  data       text not null,
  created_at timestamptz not null default now()
);
create index if not exists shortage_photos_branch_created on public.shortage_photos (branch_id, created_at);
alter table public.shortage_photos enable row level security;
revoke all on public.shortage_photos from anon, authenticated;

-- ---------- تنظيف الأسطر: اسم + كمية (+ صورة للنواقص) ----------
create or replace function public._clean_rows(p jsonb, p_with_photo boolean) returns jsonb
language sql immutable as $$
  select coalesce(jsonb_agg(
           jsonb_strip_nulls(jsonb_build_object(
             'name', left(trim(e->>'name'), 80),
             'qty', left(trim(coalesce(e->>'qty', '')), 30),
             'photo', case when p_with_photo and (e->>'photo') ~ '^[0-9a-f-]{36}$' then e->>'photo' end))
           order by n), '[]'::jsonb)
  from (
    select e, n from jsonb_array_elements(case when jsonb_typeof(p) = 'array' then p else '[]'::jsonb end) with ordinality as x(e, n)
    where jsonb_typeof(e) = 'object' and coalesce(trim(e->>'name'), '') <> ''
    limit 150
  ) q;
$$;

-- ---------- بيانات اليوم (تحل محل النسخة السابقة) ----------
create or replace function public.app_day(p_token uuid, p_day date) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare s public.sessions := public._sess(p_token);
begin
  if s.is_admin then
    return jsonb_build_object(
      'today', public._today(),
      'reports', coalesce((select jsonb_agg(to_jsonb(r)) from public.reports r where r.day = p_day), '[]'::jsonb),
      'checklists', coalesce((select jsonb_agg(to_jsonb(c)) from public.checklists c where c.day = p_day), '[]'::jsonb),
      'orders', coalesce((select jsonb_agg(to_jsonb(o)) from public.orders o where o.day = p_day), '[]'::jsonb),
      'stocks', coalesce((select jsonb_agg(to_jsonb(k)) from public.stock_counts k where k.day = p_day), '[]'::jsonb),
      'board', (select to_jsonb(b) from public.board b where id = 1));
  end if;
  return jsonb_build_object(
    'today', public._today(),
    'staff', s.staff,
    'report', (select to_jsonb(r) from public.reports r where r.day = p_day and r.branch_id = s.branch_id),
    'checklist', (select to_jsonb(c) from public.checklists c where c.day = p_day and c.branch_id = s.branch_id),
    'order', (select to_jsonb(o) from public.orders o where o.day = p_day and o.branch_id = s.branch_id),
    'prev_order', (select to_jsonb(o) from public.orders o where o.day < p_day and o.branch_id = s.branch_id order by o.day desc limit 1),
    'stock', (select to_jsonb(k) from public.stock_counts k where k.day = p_day and k.branch_id = s.branch_id),
    'prev_stock', (select to_jsonb(k) from public.stock_counts k where k.day < p_day and k.branch_id = s.branch_id order by k.day desc limit 1),
    'board', (select to_jsonb(b) from public.board b where id = 1));
end $$;

-- ---------- النواقص (تحل محل النسخة السابقة) ----------
create or replace function public.app_save_order(p_token uuid, p_day date, p_items jsonb, p_extras jsonb, p_notes text, p_branch text default null) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  s public.sessions := public._sess(p_token);
  v_branch text := public._target_branch(s, p_branch);
  v_rows jsonb := public._clean_rows(p_extras, true);
  o public.orders;
begin
  perform public._check_day(s, p_day);
  insert into public.orders as t (day, branch_id, items, extras, item_count, notes, staff, updated_at)
  values (p_day, v_branch, '{}'::jsonb, v_rows, jsonb_array_length(v_rows), left(nullif(trim(p_notes), ''), 1000), s.staff, now())
  on conflict (day, branch_id) do update set
    items = '{}'::jsonb, extras = excluded.extras, item_count = excluded.item_count,
    notes = excluded.notes, staff = excluded.staff, updated_at = now()
  returning * into o;
  return to_jsonb(o);
end $$;

-- ---------- الجرد بأسطر حرة ----------
create or replace function public.app_save_stock_rows(p_token uuid, p_day date, p_rows jsonb, p_branch text default null) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  s public.sessions := public._sess(p_token);
  v_branch text := public._target_branch(s, p_branch);
  v_rows jsonb := public._clean_rows(p_rows, false);
  k public.stock_counts;
begin
  perform public._check_day(s, p_day);
  insert into public.stock_counts as t (day, branch_id, items, extras, item_count, staff, updated_at)
  values (p_day, v_branch, '{}'::jsonb, v_rows, jsonb_array_length(v_rows), s.staff, now())
  on conflict (day, branch_id) do update set
    items = '{}'::jsonb, extras = excluded.extras, item_count = excluded.item_count, staff = excluded.staff, updated_at = now()
  returning * into k;
  return to_jsonb(k);
end $$;

-- ---------- الصور ----------
create or replace function public.app_add_photo(p_token uuid, p_data text) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare
  s public.sessions := public._sess(p_token);
  v_id uuid;
begin
  if p_data !~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$' or length(p_data) > 400000 then raise exception 'BAD_PHOTO'; end if;
  if (select count(*) from public.shortage_photos
       where branch_id is not distinct from s.branch_id and created_at > now() - interval '1 day') >= 200 then
    raise exception 'TOO_MANY_PHOTOS';
  end if;
  delete from public.shortage_photos where created_at < now() - interval '45 days';
  insert into public.shortage_photos (branch_id, data) values (s.branch_id, p_data) returning id into v_id;
  return v_id;
end $$;

-- الإدارة تشوف كل الصور، والفرع يشوف صوره فقط
create or replace function public.app_photos(p_token uuid, p_ids uuid[]) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare s public.sessions := public._sess(p_token);
begin
  if coalesce(array_length(p_ids, 1), 0) > 100 then raise exception 'BAD_INPUT'; end if;
  return coalesce((select jsonb_object_agg(id, data) from public.shortage_photos
                    where id = any(p_ids) and (s.is_admin or branch_id = s.branch_id)), '{}'::jsonb);
end $$;

-- ---------- الصلاحيات ----------
revoke execute on function
  public._clean_rows(jsonb, boolean),
  public.app_save_stock_rows(uuid, date, jsonb, text), public.app_add_photo(uuid, text), public.app_photos(uuid, uuid[])
from public, anon, authenticated;

grant execute on function
  public.app_save_stock_rows(uuid, date, jsonb, text), public.app_add_photo(uuid, text), public.app_photos(uuid, uuid[])
to anon, authenticated;

notify pgrst, 'reload schema';
