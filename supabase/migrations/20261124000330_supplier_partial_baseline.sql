alter table public.ahim_supplier_sites add column baseline_exceptions text[] not null default '{}';
create or replace function public.ahim_supplier_schedule_dates() returns trigger language plpgsql
set search_path='' as $$
begin
  if new.removed_at is not null or new.monitor_hours=0 then new.next_monitor_at=null;
  elsif old.monitor_hours<>new.monitor_hours or new.state in ('complete','failed') and old.state='running' then
    new.next_monitor_at=now()+make_interval(hours=>new.monitor_hours);
  end if;
  if new.state='complete' and old.state='running' then
    if new.run_kind='pull' and (new.pulled>0 or new.issues='[]'::jsonb) then
      new.baseline_at=now();
      new.baseline_exceptions=array(select distinct item->>'id' from jsonb_array_elements(new.issues) item);
    elsif new.run_kind='monitor' and new.issues='[]'::jsonb then
      new.last_monitor_ok=now();
    end if;
  end if;
  return new;
end $$;
update public.ahim_supplier_sites s set baseline_at=finished_at,
  baseline_exceptions=array(select distinct item->>'id' from jsonb_array_elements(s.issues) item)
where state='complete' and run_kind='pull' and finished_at is not null and pulled>0 and baseline_at is null;
