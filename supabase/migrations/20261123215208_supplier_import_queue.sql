create table public.ahim_supplier_imports(
 shop_domain text not null, domain text not null, source_id text not null,
 revision text not null, percent numeric not null, manual_price numeric, collection_ids text[] not null,
 state text not null default 'queued' check(state in ('queued','running','done','failed')),
 token uuid, available_at timestamptz not null default now(), attempts integer not null default 0, error text,
 primary key(shop_domain,domain,source_id),
 foreign key(shop_domain,domain) references public.ahim_supplier_sites(shop_domain,domain)
);
alter table public.ahim_supplier_imports enable row level security;
revoke all on public.ahim_supplier_imports from public,anon,authenticated;
grant select,insert,update on public.ahim_supplier_imports to service_role;
create index ahim_supplier_import_queue on public.ahim_supplier_imports(shop_domain,available_at) where state in ('queued','running');
