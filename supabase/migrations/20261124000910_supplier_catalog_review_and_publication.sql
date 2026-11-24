alter table public.ahim_supplier_imports add column intent text not null default 'draft' check(intent in ('draft','publish'));
alter table public.ahim_supplier_sites add column excluded_ids text[] not null default '{}';

create function public.ahim_resolve_supplier_issue(p_shop text,p_domain text,p_id text,p_run timestamptz,
  p_snapshot jsonb,p_revision text) returns boolean language plpgsql security invoker set search_path='' as $$
declare
  s public.ahim_supplier_sites%rowtype;
  supplier_name text := case when p_domain='redback.co.il' then 'redback' else p_domain end;
begin
  select * into s from public.ahim_supplier_sites where shop_domain=p_shop and domain=p_domain and removed_at is null for update;
  if not found or s.state in ('queued','running') or s.pull_started_at is distinct from p_run
    or not exists(select 1 from jsonb_array_elements(s.issues) e where e->>'id'=p_id) then return false; end if;
  if p_snapshot is null then
    update public.ahim_supplier_previews set review_state='ignored'
      where shop_domain=p_shop and supplier=supplier_name and source_id=p_id;
  else
    if p_snapshot->>'id' is distinct from p_id or p_revision is null then return false; end if;
    insert into public.ahim_supplier_previews(shop_domain,supplier,source_id,snapshot,revision,category_ids,review_state)
      values(p_shop,supplier_name,p_id,p_snapshot,p_revision,array(select jsonb_array_elements_text(p_snapshot->'categoryIds')),'known')
      on conflict(shop_domain,supplier,source_id) do update set snapshot=excluded.snapshot,revision=excluded.revision,
        category_ids=excluded.category_ids,review_state='known',scan_error=null,scanned_at=now();
  end if;
  update public.ahim_supplier_sites set issues=coalesce((select jsonb_agg(e) from jsonb_array_elements(s.issues) e where e->>'id'<>p_id),'[]'::jsonb),
    excluded_ids=case when p_snapshot is null and not(p_id=any(s.excluded_ids)) then array_append(s.excluded_ids,p_id)
      else s.excluded_ids end where shop_domain=p_shop and domain=p_domain;
  return true;
end $$;
revoke all on function public.ahim_resolve_supplier_issue(text,text,text,timestamptz,jsonb,text) from public,anon,authenticated;
grant execute on function public.ahim_resolve_supplier_issue(text,text,text,timestamptz,jsonb,text) to service_role;
