alter table public.ahim_supplier_sites
  add column removed_at timestamptz,
  add column pull_started_at timestamptz,
  add column pull_sampled_at timestamptz,
  add column pull_checked integer not null default 0 check (pull_checked >= 0),
  add column pull_total integer check (pull_total >= 0);
