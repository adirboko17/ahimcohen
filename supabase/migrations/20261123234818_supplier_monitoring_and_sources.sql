alter table public.ahim_supplier_sites
  add column platform text not null default 'woo' check(platform in ('woo','shopify')),
  add column currency text,
  add column monitor_hours integer not null default 0 check(monitor_hours in (0,1,6,12,24)),
  add column next_monitor_at timestamptz, add column last_monitor_ok timestamptz,
  add column baseline_at timestamptz,
  add column run_kind text not null default 'pull' check(run_kind in ('pull','monitor')),
  add column phase text not null default 'catalog' check(phase in ('linked','index','catalog')),
  add column linked_cursor text not null default '',
  add column index_group integer not null default 0, add column index_page integer not null default 1,
  add column source_index jsonb not null default '{}';
update public.ahim_supplier_sites set baseline_at=finished_at where state='complete' and issues='[]'::jsonb;
alter table public.ahim_supplier_previews add column review_state text not null default 'known'
  check(review_state in ('known','pending','ignored'));
create index ahim_supplier_pending_reviews on public.ahim_supplier_previews(shop_domain,supplier,source_id)
  where review_state='pending' and shopify_product_id is null;

create function public.ahim_supplier_schedule_dates() returns trigger language plpgsql
set search_path='' as $$
begin
  if new.removed_at is not null or new.monitor_hours=0 then new.next_monitor_at=null;
  elsif old.monitor_hours<>new.monitor_hours or new.state in ('complete','failed') and old.state='running' then
    new.next_monitor_at=now()+make_interval(hours=>new.monitor_hours);
  end if;
  if new.state='complete' and old.state='running' and new.issues='[]'::jsonb then
    new.baseline_at=coalesce(new.baseline_at,now());
    if new.run_kind='monitor' then new.last_monitor_ok=now(); end if;
  end if;
  return new;
end $$;
revoke all on function public.ahim_supplier_schedule_dates() from public,anon,authenticated;
create trigger ahim_supplier_schedule_dates before update on public.ahim_supplier_sites
for each row execute function public.ahim_supplier_schedule_dates();
create extension if not exists pg_cron;
select cron.schedule('ahim-supplier-monitor','* * * * *',$job$
  update public.ahim_supplier_sites set state='queued',run_kind='monitor',phase='linked',
    linked_cursor='',index_group=0,index_page=1,source_index='{}',cursor_page=1,page_count=0,pulled=0,
    pull_checked=0,pull_total=null,pull_started_at=now(),pull_sampled_at=null,issues='[]',
    lease=null,lease_until=null,attempts=0,last_error=null,finished_at=null,next_monitor_at=null
    where removed_at is null and monitor_hours>0 and baseline_at is not null and next_monitor_at<=now()
      and state not in ('queued','running');
$job$);
