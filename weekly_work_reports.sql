create extension if not exists pgcrypto;

create table if not exists public.weekly_work_reports (
  id uuid primary key default gen_random_uuid(),
  date date not null default current_date,
  "user" text not null default '',
  section text not null default '',
  content text not null default '',
  order_index integer not null default 1,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

alter table public.weekly_work_reports
  add column if not exists date date,
  add column if not exists "user" text default '',
  add column if not exists section text default '',
  add column if not exists content text default '',
  add column if not exists order_index integer default 1,
  add column if not exists "createdAt" timestamptz default now(),
  add column if not exists "updatedAt" timestamptz default now();

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'weekly_work_reports'
      and column_name = 'reportDate'
  ) then
    execute '
      update public.weekly_work_reports
      set date = coalesce(date, "reportDate")
      where date is null
    ';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'weekly_work_reports'
      and column_name = ''weekStartDate''
  ) then
    execute '
      update public.weekly_work_reports
      set date = coalesce(date, "weekStartDate")
      where date is null
    ';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'weekly_work_reports'
      and column_name = 'assignee'
  ) then
    execute '
      update public.weekly_work_reports
      set "user" = coalesce(nullif("user", ''''''), assignee, '''''')
      where coalesce("user", '''''') = ''''''
    ';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'weekly_work_reports'
      and column_name = 'category'
  ) then
    execute '
      update public.weekly_work_reports
      set section = coalesce(nullif(section, ''''''), category, '''''')
      where coalesce(section, '''''') = ''''''
    ';
  end if;
end $$;

update public.weekly_work_reports
set
  date = coalesce(date, current_date),
  "user" = coalesce("user", ''),
  section = coalesce(section, ''),
  content = coalesce(content, ''),
  order_index = coalesce(order_index, 1),
  "createdAt" = coalesce("createdAt", now()),
  "updatedAt" = coalesce("updatedAt", now());

alter table public.weekly_work_reports
  alter column date set not null,
  alter column "user" set not null,
  alter column section set not null,
  alter column content set not null,
  alter column order_index set not null,
  alter column "createdAt" set not null,
  alter column "updatedAt" set not null;

create index if not exists weekly_work_reports_date_idx
  on public.weekly_work_reports (date, order_index);

create index if not exists weekly_work_reports_user_idx
  on public.weekly_work_reports ("user");

create index if not exists weekly_work_reports_section_idx
  on public.weekly_work_reports (section);
