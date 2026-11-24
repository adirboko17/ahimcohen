create table public.ahim_supplier_stock_updates (
  id uuid primary key default gen_random_uuid(),
  shop_domain text not null,
  domain text not null,
  source_id text not null,
  title text not null,
  handle text not null,
  changes jsonb not null check (jsonb_typeof(changes) = 'array' and jsonb_array_length(changes) > 0),
  state text not null default 'pending' check (state in ('pending', 'applied', 'discarded')),
  applied_at timestamptz,
  check ((state = 'applied') = (applied_at is not null)),
  foreign key (shop_domain, domain) references public.ahim_supplier_sites(shop_domain, domain)
);

create unique index ahim_supplier_one_pending_stock_update
  on public.ahim_supplier_stock_updates (shop_domain, domain, source_id) where state = 'pending';
create index ahim_supplier_applied_stock_updates
  on public.ahim_supplier_stock_updates (shop_domain, domain, applied_at desc, id desc)
  include (source_id) where state = 'applied';

alter table public.ahim_supplier_stock_updates enable row level security;
revoke all on table public.ahim_supplier_stock_updates from public, anon, authenticated;
grant select, insert, update on table public.ahim_supplier_stock_updates to service_role;

create function public.ahim_supplier_stock_counts(p_shop text)
returns table (domain text, product_count bigint)
language sql stable security invoker set search_path = '' as $$
  select u.domain, count(distinct u.source_id)
  from public.ahim_supplier_stock_updates u
  where u.shop_domain = p_shop and u.state = 'applied'
  group by u.domain;
$$;
revoke all on function public.ahim_supplier_stock_counts(text) from public, anon, authenticated;
grant execute on function public.ahim_supplier_stock_counts(text) to service_role;

update public.ahim_supplier_sites
  set monitor_hours = 24
  where monitor_hours > 0 and monitor_hours < 24;

alter table public.ahim_supplier_sites
  drop constraint ahim_supplier_sites_monitor_hours_check,
  add constraint ahim_supplier_sites_monitor_hours_check check (monitor_hours in (0, 24));

create or replace function public.ahim_supplier_schedule_dates() returns trigger language plpgsql
set search_path = '' as $$
begin
  if new.removed_at is not null or new.monitor_hours = 0 then
    new.next_monitor_at = null;
  elsif old.monitor_hours = 0 then
    new.next_monitor_at = greatest(
      now(),
      new.last_monitor_ok + interval '24 hours',
      case when new.run_kind = 'monitor' then coalesce(new.finished_at, new.pull_started_at) + interval '24 hours' end
    );
  elsif old.monitor_hours <> new.monitor_hours or new.state in ('complete', 'failed') and old.state = 'running' then
    new.next_monitor_at = now() + interval '24 hours';
  end if;
  if new.state = 'complete' and old.state = 'running' then
    if new.run_kind = 'pull' and (new.pulled > 0 or new.issues = '[]'::jsonb) then
      new.baseline_at = now();
      new.baseline_exceptions = array(select distinct item->>'id' from jsonb_array_elements(new.issues) item);
    elsif new.run_kind = 'monitor' and new.issues = '[]'::jsonb then
      new.last_monitor_ok = now();
    end if;
  end if;
  return new;
end $$;
