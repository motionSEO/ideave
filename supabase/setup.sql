-- Run this in Supabase SQL editor once.
--
-- 임베딩·pgvector(RPC) 검색은 embedding-vector.sql 도 같은 방식으로 실행하세요.

create extension if not exists "pgcrypto";

create table if not exists public.images (
  id uuid primary key default gen_random_uuid(),
  image_url text not null,
  tags jsonb not null default '[]'::jsonb,
  file_hash text,
  created_at timestamptz not null default now()
);

create unique index if not exists images_file_hash_unique
  on public.images (file_hash)
  where file_hash is not null;

alter table public.images enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'images' and policyname = 'Allow anon select images'
  ) then
    create policy "Allow anon select images"
      on public.images
      for select
      to anon
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'images' and policyname = 'Allow anon insert images'
  ) then
    create policy "Allow anon insert images"
      on public.images
      for insert
      to anon
      with check (true);
  end if;
end $$;

insert into storage.buckets (id, name, public)
values ('images', 'images', true)
on conflict (id) do nothing;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'Allow anon upload images bucket'
  ) then
    create policy "Allow anon upload images bucket"
      on storage.objects
      for insert
      to anon
      with check (bucket_id = 'images');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'Allow anon read images bucket'
  ) then
    create policy "Allow anon read images bucket"
      on storage.objects
      for select
      to anon
      using (bucket_id = 'images');
  end if;
end $$;
