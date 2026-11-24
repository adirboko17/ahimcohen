create extension if not exists pg_net;
create table public.ahim_supplier_runners (
  shop_domain text primary key, endpoint text not null,
  token_hash text, expires_at timestamptz,
  check(endpoint ~ '^https://[a-zA-Z0-9.-]+/api/supplier-worker$')
);
alter table public.ahim_supplier_runners enable row level security;
revoke all on public.ahim_supplier_runners from public, anon, authenticated;
grant insert,select,update on public.ahim_supplier_runners to service_role;
-- Each delivery carries a short-lived single-use token scoped to this shop.
select cron.schedule('ahim-wake-supplier-workers','* * * * *',$job$
  with due as materialized (
    select r.shop_domain, gen_random_uuid()::text as token from public.ahim_supplier_runners r
    where (r.expires_at is null or r.expires_at < now()) and (
      exists (select 1 from public.ahim_supplier_sites s where s.shop_domain=r.shop_domain
        and s.removed_at is null and s.state in ('queued','running') and (s.lease_until is null or s.lease_until < now()))
      or exists (select 1 from public.ahim_supplier_imports i where i.shop_domain=r.shop_domain
        and i.state in ('queued','running') and i.available_at <= now()))
  ), issued as (
    update public.ahim_supplier_runners r set token_hash=encode(sha256(convert_to(d.token,'UTF8')),'hex'),
      expires_at=now()+interval '90 seconds' from due d where r.shop_domain=d.shop_domain
    returning r.endpoint,d.token
  )
  select net.http_post(url:=endpoint,headers:=jsonb_build_object('Authorization','Bearer '||token),
    body:='{}'::jsonb,timeout_milliseconds:=280000) from issued;
$job$);
