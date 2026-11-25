-- =====================================================================
--  دفتر المقاصف — قاعدة البيانات (Supabase / PostgreSQL)
--  شغّل هذا الملف كامل مرة وحدة من: Supabase → SQL Editor → New query
--  آمن لإعادة التشغيل: ما يحذف بيانات موجودة.
--
--  الحماية: الجداول مقفلة تماماً عن المتصفح (RLS بدون policies).
--  الموقع ما يقدر يوصل للبيانات إلا عن طريق الدوال app_* تحت،
--  وكل دالة تتحقق من جلسة دخول (رقم سري للفرع أو للإدارة).
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------- الجداول ----------
create table if not exists public.branches (
  id        text primary key,
  name      text not null,
  kind      text not null check (kind in ('canteen','cafe')),
  sort      int  not null default 0,
  pin_hash  text,
  active    boolean not null default true
);

create table if not exists public.app_settings (
  id             int primary key default 1 check (id = 1),
  admin_pin_hash text
);

create table if not exists public.sessions (
  token      uuid primary key default gen_random_uuid(),
  branch_id  text references public.branches(id) on delete cascade,
  is_admin   boolean not null default false,
  staff      text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create table if not exists public.login_attempts (
  id     bigint generated always as identity primary key,
  target text not null,
  ok     boolean not null,
  at     timestamptz not null default now()
);

create table if not exists public.reports (
  day        date not null,
  branch_id  text not null references public.branches(id),
  cash       numeric(12,2) not null default 0,
  card       numeric(12,2) not null default 0,
  expenses   numeric(12,2) not null default 0,
  waste      numeric(12,2) not null default 0,
  best       text,
  notes      text,
  staff      text,
  updated_at timestamptz not null default now(),
  primary key (day, branch_id)
);

create table if not exists public.checklists (
  day        date not null,
  branch_id  text not null references public.branches(id),
  done       jsonb not null default '{}'::jsonb,
  done_count int not null default 0,
  staff      text,
  updated_at timestamptz not null default now(),
  primary key (day, branch_id)
);

create table if not exists public.requests (
  id         uuid primary key default gen_random_uuid(),
  branch_id  text not null references public.branches(id),
  item       text not null,
  qty        text,
  urgent     boolean not null default false,
  status     text not null default 'new' check (status in ('new','ordered','delivered')),
  staff      text,
  created_at timestamptz not null default now(),
  status_at  timestamptz
);
create index if not exists requests_branch_created on public.requests (branch_id, created_at desc);

create table if not exists public.board (
  id         int primary key default 1 check (id = 1),
  body       text,
  updated_at timestamptz
);

-- قفل كل الجداول عن الوصول المباشر
alter table public.branches       enable row level security;
alter table public.app_settings   enable row level security;
alter table public.sessions       enable row level security;
alter table public.login_attempts enable row level security;
alter table public.reports        enable row level security;
alter table public.checklists     enable row level security;
alter table public.requests       enable row level security;
alter table public.board          enable row level security;
revoke all on public.branches, public.app_settings, public.sessions, public.login_attempts,
              public.reports, public.checklists, public.requests, public.board
  from anon, authenticated;

-- ---------- الفروع ----------
insert into public.branches (id, name, kind, sort) values
  ('b1', 'مقصف عيوش',          'canteen', 1),
  ('b2', 'مقصف أروى ولجين',    'canteen', 2),
  ('b3', 'مقصف أقصى ويسرى',    'canteen', 3),
  ('b4', 'مقصف فوزية',         'canteen', 4),
  ('b5', 'مقصف أميمة',         'canteen', 5),
  ('b6', 'مقصف العنود',        'canteen', 6),
  ('c1', 'كوفي ريناد وجواهر',  'cafe',    7),
  ('c2', 'كوفي ياسمين',        'cafe',    8)
on conflict (id) do nothing;

insert into public.app_settings (id) values (1) on conflict (id) do nothing;
insert into public.board (id, body) values (1, null) on conflict (id) do nothing;

-- ---------- دوال داخلية (غير متاحة للمتصفح) ----------
create or replace function public._today() returns date
language sql stable as $$ select (now() at time zone 'Asia/Riyadh')::date $$;

create or replace function public._sess(p_token uuid) returns public.sessions
language plpgsql security definer set search_path = public, extensions as $$
declare s public.sessions;
begin
  select * into s from public.sessions where token = p_token and expires_at > now();
  if not found then raise exception 'SESSION_EXPIRED'; end if;
  return s;
end $$;

create or replace function public._need_admin(p_token uuid) returns public.sessions
language plpgsql security definer set search_path = public, extensions as $$
declare s public.sessions := public._sess(p_token);
begin
  if not s.is_admin then raise exception 'NOT_ADMIN'; end if;
  return s;
end $$;

-- الفرع اللي ينكتب عليه: الموظفة = فرعها، الإدارة = الفرع المرسل
create or replace function public._target_branch(s public.sessions, p_branch text) returns text
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if s.is_admin then
    if not exists (select 1 from public.branches where id = p_branch) then raise exception 'BAD_BRANCH'; end if;
    return p_branch;
  end if;
  return s.branch_id;
end $$;

-- الموظفة تعدّل آخر 3 أيام فقط، الإدارة أي يوم
create or replace function public._check_day(s public.sessions, p_day date) returns void
language plpgsql stable as $$
begin
  if p_day is null or p_day > public._today() then raise exception 'BAD_DAY'; end if;
  if not s.is_admin and p_day < public._today() - 3 then raise exception 'DAY_LOCKED'; end if;
end $$;

-- يُستخدم من SQL Editor فقط لتعيين رقم الإدارة السري
create or replace function public.admin_set_pin(p_pin text) returns text
language plpgsql security definer set search_path = public, extensions as $$
begin
  if p_pin !~ '^[0-9]{6,12}$' then raise exception 'رقم الإدارة لازم يكون من 6 إلى 12 رقم'; end if;
  update public.app_settings set admin_pin_hash = crypt(p_pin, gen_salt('bf')) where id = 1;
  delete from public.sessions where is_admin;
  return 'تم تعيين رقم الإدارة';
end $$;

-- ---------- دوال التطبيق (متاحة للمتصفح) ----------

-- قائمة الفروع لشاشة الدخول
create or replace function public.app_status() returns jsonb
language sql stable security definer set search_path = public, extensions as $$
  select jsonb_build_object(
    'admin_ready', (select admin_pin_hash is not null from public.app_settings where id = 1),
    'today', public._today(),
    'branches', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'kind', kind, 'ready', pin_hash is not null) order by sort)
                          from public.branches where active), '[]'::jsonb));
$$;

create or replace function public.app_login(p_branch text, p_pin text, p_staff text default null) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_admin boolean := (p_branch = 'admin');
  v_hash  text;
  v_fails int;
  v_token uuid;
  v_name  text;
begin
  delete from public.login_attempts where at < now() - interval '1 day';
  delete from public.sessions where expires_at < now();

  select count(*) into v_fails from public.login_attempts
   where target = left(coalesce(p_branch,''), 20) and not ok and at > now() - interval '15 minutes';
  if v_fails >= 8 then
    return jsonb_build_object('ok', false, 'error', 'LOCKED');
  end if;

  if v_admin then
    select admin_pin_hash, 'الإدارة' into v_hash, v_name from public.app_settings where id = 1;
  else
    select pin_hash, name into v_hash, v_name from public.branches where id = p_branch and active;
  end if;

  if v_hash is null then
    return jsonb_build_object('ok', false, 'error', 'NO_PIN');
  end if;
  if crypt(coalesce(p_pin, ''), v_hash) <> v_hash then
    insert into public.login_attempts (target, ok) values (left(coalesce(p_branch,''), 20), false);
    return jsonb_build_object('ok', false, 'error', 'BAD_PIN');
  end if;

  insert into public.login_attempts (target, ok) values (left(p_branch, 20), true);
  insert into public.sessions (branch_id, is_admin, staff, expires_at)
  values (case when v_admin then null else p_branch end, v_admin,
          nullif(left(trim(coalesce(p_staff, '')), 60), ''),
          now() + case when v_admin then interval '30 days' else interval '120 days' end)
  returning token into v_token;

  return jsonb_build_object('ok', true, 'token', v_token, 'is_admin', v_admin,
                            'branch', case when v_admin then null else p_branch end, 'name', v_name);
end $$;

create or replace function public.app_logout(p_token uuid) returns void
language sql security definer set search_path = public, extensions as $$
  delete from public.sessions where token = p_token;
$$;

-- تغيير اسم المناوبة على نفس الجهاز
create or replace function public.app_set_staff(p_token uuid, p_staff text) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare s public.sessions := public._sess(p_token);
begin
  update public.sessions set staff = nullif(left(trim(coalesce(p_staff, '')), 60), '') where token = s.token;
end $$;

-- كل بيانات اليوم: للموظفة فرعها فقط، وللإدارة كل الفروع
create or replace function public.app_day(p_token uuid, p_day date) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare s public.sessions := public._sess(p_token);
begin
  if s.is_admin then
    return jsonb_build_object(
      'today', public._today(),
      'reports', coalesce((select jsonb_agg(to_jsonb(r)) from public.reports r where r.day = p_day), '[]'::jsonb),
      'checklists', coalesce((select jsonb_agg(to_jsonb(c)) from public.checklists c where c.day = p_day), '[]'::jsonb),
      'requests', coalesce((select jsonb_agg(to_jsonb(q) order by q.created_at desc) from (
          select * from public.requests
           where status <> 'delivered' or created_at > now() - interval '14 days'
           order by created_at desc limit 300) q), '[]'::jsonb),
      'board', (select to_jsonb(b) from public.board b where id = 1));
  end if;
  return jsonb_build_object(
    'today', public._today(),
    'staff', s.staff,
    'report', (select to_jsonb(r) from public.reports r where r.day = p_day and r.branch_id = s.branch_id),
    'checklist', (select to_jsonb(c) from public.checklists c where c.day = p_day and c.branch_id = s.branch_id),
    'requests', coalesce((select jsonb_agg(to_jsonb(q) order by q.created_at desc) from (
        select * from public.requests
         where branch_id = s.branch_id and (status <> 'delivered' or created_at > now() - interval '14 days')
         order by created_at desc limit 100) q), '[]'::jsonb),
    'board', (select to_jsonb(b) from public.board b where id = 1));
end $$;

create or replace function public.app_save_report(p_token uuid, p_day date, p jsonb, p_branch text default null) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  s public.sessions := public._sess(p_token);
  v_branch text := public._target_branch(s, p_branch);
  r public.reports;
begin
  perform public._check_day(s, p_day);
  insert into public.reports as t (day, branch_id, cash, card, expenses, waste, best, notes, staff, updated_at)
  values (p_day, v_branch,
          greatest(0, coalesce(nullif(p->>'cash', '')::numeric, 0)),
          greatest(0, coalesce(nullif(p->>'card', '')::numeric, 0)),
          greatest(0, coalesce(nullif(p->>'expenses', '')::numeric, 0)),
          greatest(0, coalesce(nullif(p->>'waste', '')::numeric, 0)),
          left(nullif(trim(p->>'best'), ''), 200),
          left(nullif(trim(p->>'notes'), ''), 1500),
          coalesce(left(nullif(trim(p->>'staff'), ''), 60), s.staff),
          now())
  on conflict (day, branch_id) do update set
    cash = excluded.cash, card = excluded.card, expenses = excluded.expenses, waste = excluded.waste,
    best = excluded.best, notes = excluded.notes, staff = excluded.staff, updated_at = now()
  returning * into r;
  return to_jsonb(r);
end $$;

create or replace function public.app_save_checklist(p_token uuid, p_day date, p_done jsonb, p_branch text default null) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  s public.sessions := public._sess(p_token);
  v_branch text := public._target_branch(s, p_branch);
  v_done jsonb;
  c public.checklists;
begin
  perform public._check_day(s, p_day);
  if jsonb_typeof(p_done) <> 'object' then raise exception 'BAD_INPUT'; end if;
  select coalesce(jsonb_object_agg(key, true), '{}'::jsonb) into v_done
    from jsonb_each(p_done) where value = 'true'::jsonb and key ~ '^[a-z0-9_]{1,20}$';
  insert into public.checklists as t (day, branch_id, done, done_count, staff, updated_at)
  values (p_day, v_branch, v_done, (select count(*) from jsonb_object_keys(v_done)), s.staff, now())
  on conflict (day, branch_id) do update set
    done = excluded.done, done_count = excluded.done_count, staff = excluded.staff, updated_at = now()
  returning * into c;
  return to_jsonb(c);
end $$;

create or replace function public.app_add_request(p_token uuid, p_item text, p_qty text, p_urgent boolean) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  s public.sessions := public._sess(p_token);
  q public.requests;
begin
  if s.is_admin then raise exception 'BRANCH_ONLY'; end if;
  if coalesce(trim(p_item), '') = '' then raise exception 'BAD_INPUT'; end if;
  insert into public.requests (branch_id, item, qty, urgent, staff)
  values (s.branch_id, left(trim(p_item), 120), left(nullif(trim(p_qty), ''), 60), coalesce(p_urgent, false), s.staff)
  returning * into q;
  return to_jsonb(q);
end $$;

create or replace function public.app_set_request_status(p_token uuid, p_id uuid, p_status text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  s public.sessions := public._sess(p_token);
  q public.requests;
begin
  if p_status not in ('new', 'ordered', 'delivered') then raise exception 'BAD_INPUT'; end if;
  update public.requests set status = p_status, status_at = now()
   where id = p_id and (s.is_admin or branch_id = s.branch_id)
  returning * into q;
  if not found then raise exception 'NOT_FOUND'; end if;
  return to_jsonb(q);
end $$;

-- ---------- دوال الإدارة ----------
create or replace function public.app_set_board(p_token uuid, p_text text) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare s public.sessions := public._need_admin(p_token);
begin
  update public.board set body = left(nullif(trim(p_text), ''), 800), updated_at = now() where id = 1;
end $$;

create or replace function public.app_set_branch_pin(p_token uuid, p_branch text, p_pin text) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare s public.sessions := public._need_admin(p_token);
begin
  if p_pin !~ '^[0-9]{4,8}$' then raise exception 'BAD_PIN_FORMAT'; end if;
  update public.branches set pin_hash = crypt(p_pin, gen_salt('bf')) where id = p_branch;
  if not found then raise exception 'BAD_BRANCH'; end if;
  delete from public.sessions where branch_id = p_branch;  -- يطلع كل الأجهزة القديمة
  delete from public.login_attempts where target = p_branch;
end $$;

-- ملخص فترة: مجموع كل فرع + إجمالي كل يوم
create or replace function public.app_summary(p_token uuid, p_from date, p_to date) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare s public.sessions := public._need_admin(p_token);
begin
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 92 then raise exception 'BAD_RANGE'; end if;
  return jsonb_build_object(
    'branches', coalesce((select jsonb_agg(jsonb_build_object(
        'branch_id', b.id, 'days', coalesce(x.days, 0),
        'cash', coalesce(x.cash, 0), 'card', coalesce(x.card, 0),
        'expenses', coalesce(x.expenses, 0), 'waste', coalesce(x.waste, 0)) order by b.sort)
      from public.branches b
      left join (select branch_id, count(*) days, sum(cash) cash, sum(card) card, sum(expenses) expenses, sum(waste) waste
                   from public.reports where day between p_from and p_to group by branch_id) x on x.branch_id = b.id
      where b.active), '[]'::jsonb),
    'days', coalesce((select jsonb_agg(jsonb_build_object('day', day, 'total', total, 'reports', n) order by day)
      from (select day, sum(cash + card) total, count(*) n from public.reports
             where day between p_from and p_to group by day) d), '[]'::jsonb));
end $$;

-- ---------- الصلاحيات ----------
revoke execute on function
  public._today(), public._sess(uuid), public._need_admin(uuid),
  public._target_branch(public.sessions, text), public._check_day(public.sessions, date),
  public.admin_set_pin(text),
  public.app_status(), public.app_login(text, text, text), public.app_logout(uuid),
  public.app_set_staff(uuid, text), public.app_day(uuid, date),
  public.app_save_report(uuid, date, jsonb, text), public.app_save_checklist(uuid, date, jsonb, text),
  public.app_add_request(uuid, text, text, boolean), public.app_set_request_status(uuid, uuid, text),
  public.app_set_board(uuid, text), public.app_set_branch_pin(uuid, text, text),
  public.app_summary(uuid, date, date)
from public, anon, authenticated;

grant execute on function
  public.app_status(), public.app_login(text, text, text), public.app_logout(uuid),
  public.app_set_staff(uuid, text), public.app_day(uuid, date),
  public.app_save_report(uuid, date, jsonb, text), public.app_save_checklist(uuid, date, jsonb, text),
  public.app_add_request(uuid, text, text, boolean), public.app_set_request_status(uuid, uuid, text),
  public.app_set_board(uuid, text), public.app_set_branch_pin(uuid, text, text),
  public.app_summary(uuid, date, date)
to anon, authenticated;

notify pgrst, 'reload schema';
