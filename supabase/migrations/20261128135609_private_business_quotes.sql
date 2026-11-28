insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ahim-business-quotes', 'ahim-business-quotes', false, 4194304,
        array['application/json', 'application/octet-stream'])
on conflict (id) do nothing;
