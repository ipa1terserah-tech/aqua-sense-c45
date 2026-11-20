create table if not exists public.telemetry (
  id uuid primary key default gen_random_uuid(),
  pond_id text not null,
  device_id text not null,
  location text,
  temperature double precision not null,
  ph double precision not null,
  salinity double precision not null,
  measured_at timestamptz not null,
  received_at timestamptz not null default now(),
  source text not null default 'ESP32_LIVE',
  is_complete boolean not null default true,
  classification text,
  recommendation text
);

create index if not exists telemetry_pond_measured_at_idx
  on public.telemetry (pond_id, measured_at desc);

create index if not exists telemetry_device_measured_at_idx
  on public.telemetry (device_id, measured_at desc);

alter table public.telemetry enable row level security;

grant select on public.telemetry to anon, authenticated;

drop policy if exists telemetry_read_mvp on public.telemetry;
create policy telemetry_read_mvp
  on public.telemetry
  for select
  to anon, authenticated
  using (true);

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'telemetry'
  ) then
    execute 'alter publication supabase_realtime add table public.telemetry';
  end if;
end
$$;
