-- Run once in Supabase SQL editor (existing projects).
-- Stores SHA-256 hex digest of image bytes for duplicate detection.

alter table public.images
  add column if not exists file_hash text;

comment on column public.images.file_hash is 'SHA-256 hex hash of image file contents';

create unique index if not exists images_file_hash_unique
  on public.images (file_hash)
  where file_hash is not null;
