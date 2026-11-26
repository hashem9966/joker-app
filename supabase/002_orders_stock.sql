-- =====================================================================
--  تحديث 002: قائمة الأصناف + الطلبية اليومية + الجرد
--  شغّله مرة وحدة بعد schema.sql من: Supabase → SQL Editor → New query
--  آمن لإعادة التشغيل، وما يحذف أي بيانات.
-- =====================================================================

-- ---------- الجداول ----------
create table if not exists public.products (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  unit       text,
  category   text,
  kind       text not null default 'all' check (kind in ('all','canteen','cafe')),
  sort       int  not null default 0,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists products_active_name on public.products (lower(name)) where active;

-- طلبية الفرع لليوم: items = {product_id: الكمية}، extras = أصناف مكتوبة يدوياً
create table if not exists public.orders (
  day        date not null,
  branch_id  text not null references public.branches(id),
  items      jsonb not null default '{}'::jsonb,
  extras     jsonb not null default '[]'::jsonb,
  item_count int  not null default 0,
  notes      text,
  staff      text,
  updated_at timestamptz not null default now(),
  primary key (day, branch_id)
);

-- جرد آخر اليوم: items = {product_id: المتبقي} (صفر = خلص)
create table if not exists public.stock_counts (
  day        date not null,
  branch_id  text not null references public.branches(id),
  items      jsonb not null default '{}'::jsonb,
  item_count int  not null default 0,
  staff      text,
  updated_at timestamptz not null default now(),
  primary key (day, branch_id)
);

alter table public.products     enable row level security;
alter table public.orders       enable row level security;
alter table public.stock_counts enable row level security;
revoke all on public.products, public.orders, public.stock_counts from anon, authenticated;

-- ---------- دوال داخلية ----------
-- تنظيف خريطة الكميات: مفاتيح uuid وأرقام فقط
create or replace function public._clean_qty(p jsonb, p_allow_zero boolean) returns jsonb
language sql immutable as $$
  select coalesce(jsonb_object_agg(key, round(value::text::numeric, 2)), '{}'::jsonb)
  from (
    select key, value from jsonb_each(case when jsonb_typeof(p) = 'object' then p else '{}'::jsonb end)
    where key ~ '^[0-9a-f-]{36}$'
      and case when jsonb_typeof(value) = 'number'
               then (value::text::numeric > 0 or (p_allow_zero and value::text::numeric = 0))
                    and value::text::numeric < 100000
               else false end
    limit 1000
  ) q;
$$;

-- ---------- بيانات اليوم (تحل محل النسخة السابقة) ----------
create or replace function public.app_day(p_token uuid, p_day date) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  s public.sessions := public._sess(p_token);
  v_kind text;
begin
  if s.is_admin then
    return jsonb_build_object(
      'today', public._today(),
      'reports', coalesce((select jsonb_agg(to_jsonb(r)) from public.reports r where r.day = p_day), '[]'::jsonb),
      'checklists', coalesce((select jsonb_agg(to_jsonb(c)) from public.checklists c where c.day = p_day), '[]'::jsonb),
      'orders', coalesce((select jsonb_agg(to_jsonb(o)) from public.orders o where o.day = p_day), '[]'::jsonb),
      'stocks', coalesce((select jsonb_agg(to_jsonb(k)) from public.stock_counts k where k.day = p_day), '[]'::jsonb),
      'products', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'unit', unit, 'category', category, 'kind', kind, 'active', active)
                                             order by category nulls last, sort, created_at) from public.products), '[]'::jsonb),
      'board', (select to_jsonb(b) from public.board b where id = 1));
  end if;

  select kind into v_kind from public.branches where id = s.branch_id;
  return jsonb_build_object(
    'today', public._today(),
    'staff', s.staff,
    'report', (select to_jsonb(r) from public.reports r where r.day = p_day and r.branch_id = s.branch_id),
    'checklist', (select to_jsonb(c) from public.checklists c where c.day = p_day and c.branch_id = s.branch_id),
    'order', (select to_jsonb(o) from public.orders o where o.day = p_day and o.branch_id = s.branch_id),
    'prev_order', (select to_jsonb(o) from public.orders o where o.day < p_day and o.branch_id = s.branch_id order by o.day desc limit 1),
    'stock', (select to_jsonb(k) from public.stock_counts k where k.day = p_day and k.branch_id = s.branch_id),
    'products', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'unit', unit, 'category', category)
                                           order by category nulls last, sort, created_at)
                          from public.products where active and kind in ('all', v_kind)), '[]'::jsonb),
    'board', (select to_jsonb(b) from public.board b where id = 1));
end $$;

-- ---------- الطلبية والجرد ----------
create or replace function public.app_save_order(p_token uuid, p_day date, p_items jsonb, p_extras jsonb, p_notes text, p_branch text default null) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  s public.sessions := public._sess(p_token);
  v_branch text := public._target_branch(s, p_branch);
  v_items jsonb := public._clean_qty(p_items, false);
  v_extras jsonb;
  o public.orders;
begin
  perform public._check_day(s, p_day);
  select coalesce(jsonb_agg(jsonb_build_object('name', left(trim(e->>'name'), 80), 'qty', left(trim(coalesce(e->>'qty', '')), 30))), '[]'::jsonb)
    into v_extras
    from (select e from jsonb_array_elements(case when jsonb_typeof(p_extras) = 'array' then p_extras else '[]'::jsonb end) e
           where jsonb_typeof(e) = 'object' and coalesce(trim(e->>'name'), '') <> '' limit 60) x;
  insert into public.orders as t (day, branch_id, items, extras, item_count, notes, staff, updated_at)
  values (p_day, v_branch, v_items, v_extras,
          (select count(*) from jsonb_object_keys(v_items)) + jsonb_array_length(v_extras),
          left(nullif(trim(p_notes), ''), 1000), s.staff, now())
  on conflict (day, branch_id) do update set
    items = excluded.items, extras = excluded.extras, item_count = excluded.item_count,
    notes = excluded.notes, staff = excluded.staff, updated_at = now()
  returning * into o;
  return to_jsonb(o);
end $$;

create or replace function public.app_save_stock(p_token uuid, p_day date, p_items jsonb, p_branch text default null) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  s public.sessions := public._sess(p_token);
  v_branch text := public._target_branch(s, p_branch);
  v_items jsonb := public._clean_qty(p_items, true);
  k public.stock_counts;
begin
  perform public._check_day(s, p_day);
  insert into public.stock_counts as t (day, branch_id, items, item_count, staff, updated_at)
  values (p_day, v_branch, v_items, (select count(*) from jsonb_object_keys(v_items)), s.staff, now())
  on conflict (day, branch_id) do update set
    items = excluded.items, item_count = excluded.item_count, staff = excluded.staff, updated_at = now()
  returning * into k;
  return to_jsonb(k);
end $$;

-- ---------- إدارة الأصناف (للإدارة فقط) ----------
create or replace function public.app_products_add(p_token uuid, p_items jsonb) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  s public.sessions := public._need_admin(p_token);
  r record;
  v_name text;
  v_kind text;
  v_added int := 0;
  v_skipped int := 0;
  v_sort int;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 500 then raise exception 'BAD_INPUT'; end if;
  select coalesce(max(sort), 0) into v_sort from public.products;
  for r in select * from jsonb_to_recordset(p_items) as x(name text, unit text, category text, kind text) loop
    v_name := left(trim(coalesce(r.name, '')), 80);
    if v_name = '' then continue; end if;
    if exists (select 1 from public.products where active and lower(name) = lower(v_name)) then
      v_skipped := v_skipped + 1; continue;
    end if;
    v_kind := case when r.kind in ('all', 'canteen', 'cafe') then r.kind else 'all' end;
    v_sort := v_sort + 1;
    insert into public.products (name, unit, category, kind, sort)
    values (v_name, left(nullif(trim(r.unit), ''), 30), left(nullif(trim(r.category), ''), 40), v_kind, v_sort);
    v_added := v_added + 1;
  end loop;
  return jsonb_build_object('added', v_added, 'skipped', v_skipped);
end $$;

create or replace function public.app_product_update(p_token uuid, p_id uuid, p jsonb) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare s public.sessions := public._need_admin(p_token);
begin
  if coalesce(trim(p->>'name'), '') = '' then raise exception 'BAD_INPUT'; end if;
  update public.products set
    name = left(trim(p->>'name'), 80),
    unit = left(nullif(trim(p->>'unit'), ''), 30),
    category = left(nullif(trim(p->>'category'), ''), 40),
    kind = case when p->>'kind' in ('all', 'canteen', 'cafe') then p->>'kind' else kind end
  where id = p_id and active;
  if not found then raise exception 'NOT_FOUND'; end if;
exception when unique_violation then
  raise exception 'DUPLICATE';
end $$;

-- الحذف يخفي الصنف فقط، والطلبيات القديمة تبقى تعرض اسمه
create or replace function public.app_product_delete(p_token uuid, p_id uuid) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare s public.sessions := public._need_admin(p_token);
begin
  update public.products set active = false where id = p_id;
end $$;

-- ---------- الصلاحيات ----------
revoke execute on function
  public._clean_qty(jsonb, boolean),
  public.app_save_order(uuid, date, jsonb, jsonb, text, text), public.app_save_stock(uuid, date, jsonb, text),
  public.app_products_add(uuid, jsonb), public.app_product_update(uuid, uuid, jsonb), public.app_product_delete(uuid, uuid)
from public, anon, authenticated;

grant execute on function
  public.app_save_order(uuid, date, jsonb, jsonb, text, text), public.app_save_stock(uuid, date, jsonb, text),
  public.app_products_add(uuid, jsonb), public.app_product_update(uuid, uuid, jsonb), public.app_product_delete(uuid, uuid)
to anon, authenticated;

notify pgrst, 'reload schema';
