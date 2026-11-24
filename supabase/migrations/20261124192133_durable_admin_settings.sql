create table public.ahim_admin_settings (
  shop_domain text primary key,
  settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  writer uuid,
  lease_until timestamptz
);
create table public.ahim_admin_accounts (
  shop_domain text primary key,
  email text not null,
  salt text not null check (salt ~ '^[0-9a-f]{32}$'),
  hash text not null check (hash ~ '^[0-9a-f]{128}$'),
  secret text not null default (replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')),
  attempts integer not null default 0,
  window_end timestamptz not null default now()
);
alter table public.ahim_admin_settings enable row level security;
alter table public.ahim_admin_accounts enable row level security;
revoke all on public.ahim_admin_settings, public.ahim_admin_accounts from public, anon, authenticated;
grant select, insert, update on public.ahim_admin_settings, public.ahim_admin_accounts to service_role;

-- Serialize callbacks before they perform any Shopify or media writes.
create function public.ahim_begin_admin_edit(shop text, token uuid)
returns setof jsonb language sql security invoker set search_path = '' as $$
  update public.ahim_admin_settings set writer = token, lease_until = now() + interval '35 minutes'
  where shop_domain = shop and (writer is null or lease_until <= now())
  returning settings;
$$;
create function public.ahim_admin_login_attempt(shop text)
returns boolean language sql security invoker set search_path = '' as $$
  with permitted as (
    update public.ahim_admin_accounts
    set attempts = case when window_end <= now() then 1 else attempts + 1 end,
        window_end = case when window_end <= now() then now() + interval '10 minutes' else window_end end
    where shop_domain = shop and (window_end <= now() or attempts < 8)
    returning 1
  ) select exists(select from permitted);
$$;
revoke all on function public.ahim_begin_admin_edit(text, uuid), public.ahim_admin_login_attempt(text) from public, anon, authenticated;
grant execute on function public.ahim_begin_admin_edit(text, uuid), public.ahim_admin_login_attempt(text) to service_role;

insert into storage.buckets (id, name, public, allowed_mime_types)
values ('ahim-hero-images', 'ahim-hero-images', true, array['image/webp']);
