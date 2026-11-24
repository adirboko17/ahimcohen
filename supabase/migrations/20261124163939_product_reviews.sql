create table public.ahim_product_reviews (
  shop_domain text not null,
  id uuid not null,
  product_id text not null check (char_length(product_id) between 1 and 512),
  author text not null check (char_length(btrim(author)) between 1 and 80),
  rating smallint not null check (rating between 1 and 5),
  text text not null check (char_length(btrim(text)) between 1 and 2000),
  published boolean not null default false,
  source text not null check (source in ('admin', 'customer')),
  created_at timestamptz not null default now(),
  primary key (shop_domain, id)
);

create index ahim_product_reviews_public_idx
  on public.ahim_product_reviews (shop_domain, product_id, created_at desc, id desc)
  where published;

create index ahim_product_reviews_admin_idx
  on public.ahim_product_reviews (shop_domain, created_at desc, id desc);

alter table public.ahim_product_reviews enable row level security;
revoke all on table public.ahim_product_reviews from public, anon, authenticated;
grant select, insert, update, delete on table public.ahim_product_reviews to service_role;
