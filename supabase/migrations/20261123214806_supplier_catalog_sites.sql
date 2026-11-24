create table public.ahim_supplier_sites (
  shop_domain text not null, domain text not null,
  categories jsonb not null default '[]', mappings jsonb not null default '{}',
  selection text[] not null default '{}', pull_all boolean not null default false,
  percent numeric not null default 0 check(percent >= -100),
  state text not null default 'idle' check(state in ('idle','queued','running','complete','failed')),
  cursor_page integer not null default 1, page_count integer not null default 0,
  pulled integer not null default 0, issues jsonb not null default '[]',
  last_error text, discovered_at timestamptz, finished_at timestamptz,
  lease uuid, lease_until timestamptz, attempts integer not null default 0,
  primary key(shop_domain,domain)
);
alter table public.ahim_supplier_sites enable row level security;
revoke all on public.ahim_supplier_sites from public,anon,authenticated;
grant select,insert,update on public.ahim_supplier_sites to service_role;
alter table public.ahim_supplier_previews add column category_ids text[] not null default '{}',
  add column manual_price numeric check(manual_price>=0), add column draft_snapshot jsonb;
update public.ahim_supplier_previews set draft_snapshot=snapshot where shopify_product_id is not null;
insert into public.ahim_supplier_sites(shop_domain,domain)
select distinct shop_domain,'redback.co.il' from public.ahim_supplier_previews where supplier='redback';
create index ahim_supplier_category_idx on public.ahim_supplier_previews using gin(category_ids);
