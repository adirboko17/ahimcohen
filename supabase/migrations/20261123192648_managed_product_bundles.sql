create table public.ahim_bundle_mappings (
  shop_domain text not null,
  source_product_id text not null check (source_product_id <> ''),
  shopify_product_id text not null check (shopify_product_id ~ '^gid://shopify/Product/[0-9]+$'),
  revision text not null,
  variants jsonb not null default '[]'::jsonb check (jsonb_typeof(variants) = 'array'),
  primary key (shop_domain, source_product_id)
);

alter table public.ahim_bundle_mappings enable row level security;
revoke all on table public.ahim_bundle_mappings from public, anon, authenticated;
grant select, insert, update on table public.ahim_bundle_mappings to service_role;
