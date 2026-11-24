create table public.ahim_supplier_previews (
  shop_domain text not null,
  supplier text not null,
  source_id text not null,
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  revision text not null,
  scanned_at timestamptz not null default now(),
  shopify_product_id text,
  primary key (shop_domain, supplier, source_id),
  unique (shop_domain, shopify_product_id)
);

alter table public.ahim_supplier_previews enable row level security;
revoke all on table public.ahim_supplier_previews from public, anon, authenticated;
grant select, insert, update on table public.ahim_supplier_previews to service_role;
