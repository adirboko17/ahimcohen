alter table public.ahim_supplier_previews
  add column import_token uuid,
  add column import_started_at timestamptz,
  add column verified_at timestamptz,
  add column collection_ids text[] not null default '{}';
