create extension if not exists pgcrypto;

create table if not exists public.weekly_work_reports (
  id uuid primary key default gen_random_uuid(),
  "reportYear" integer not null,
  "reportMonth" integer not null,
  "weekNumber" integer not null,
  "weekStartDate" date not null,
  "reportDate" date not null,
  assignee text not null default '',
  team text not null default '',
  category text not null default '',
  content text not null default '',
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create index if not exists weekly_work_reports_week_idx
  on public.weekly_work_reports ("weekStartDate", "reportDate");

create index if not exists weekly_work_reports_filter_idx
  on public.weekly_work_reports (assignee, team, category);
