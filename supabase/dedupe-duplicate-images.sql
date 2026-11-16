-- Run once in Supabase SQL editor to remove duplicate image rows.
-- Keeps the oldest row (earliest created_at) per file_hash and per image_url.

-- 1) Duplicates by file_hash (same image bytes)
delete from public.images d
using (
  select id
  from (
    select
      id,
      row_number() over (
        partition by file_hash
        order by created_at asc, id asc
      ) as rn
    from public.images
    where file_hash is not null
  ) ranked
  where rn > 1
) dup
where d.id = dup.id;

-- 2) Duplicates by image_url (same public URL, including rows without file_hash)
delete from public.images d
using (
  select id
  from (
    select
      id,
      row_number() over (
        partition by image_url
        order by created_at asc, id asc
      ) as rn
    from public.images
  ) ranked
  where rn > 1
) dup
where d.id = dup.id;
