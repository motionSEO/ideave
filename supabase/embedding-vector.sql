-- pgvector + images.embedding + 코사인 유사도 검색 RPC
-- 기존 프로젝트에 setup.sql 실행 후, Supabase SQL Editor에서 이 파일도 실행하세요.
--
-- 42883 operator does not exist (vector <=> vector) 는 보통
-- SECURITY DEFINER 함수의 search_path 에서 extensions 가 빠져서 pgvector 연산자를 못 찾을 때 발생합니다.
-- Supabase는 vector 확장을 보통 schema "extensions" 에 둡니다.

create extension if not exists vector with schema extensions;

alter table public.images
  add column if not exists embedding vector(1536);

comment on column public.images.embedding is 'OpenAI text-embedding-3-small (1536 dims), 태그 등 텍스트 요약 임베딩';

-- 행이 쌓인 뒤 인덱스 권장
-- create index concurrently if not exists images_embedding_ivfflat_idx
--   on public.images using ivfflat (embedding vector_cosine_ops)
--   with (lists = 50);
-- create index concurrently if not exists images_embedding_hnsw_idx
--   on public.images using hnsw (embedding vector_cosine_ops);

create or replace function public.match_images_by_embedding (
  query_embedding vector(1536),
  match_count int default 30
)
returns table (
  id uuid,
  image_url text,
  tags jsonb,
  created_at timestamptz,
  similarity double precision
)
language sql
stable
security definer
set search_path = public, extensions, pg_catalog
as $$
  select
    i.id,
    i.image_url,
    i.tags,
    i.created_at,
    (1 - (i.embedding <=> query_embedding))::double precision as similarity
  from public.images i
  where i.embedding is not null
  order by i.embedding <=> query_embedding
  limit greatest(1, least(match_count, 200));
$$;

grant execute on function public.match_images_by_embedding(vector, int) to anon, authenticated;
grant execute on function public.match_images_by_embedding(vector, int) to service_role;

-- 선택한 행의 embedding 기준 최근접 코사인 이웃 (자기 자신 제외).
-- 참조 행에 embedding 이 없거나 없는 id 면 결과 0건.
create or replace function public.match_images_similar_to_reference (
  reference_id uuid,
  match_count int default 20
)
returns table (
  id uuid,
  image_url text,
  tags jsonb,
  created_at timestamptz,
  similarity double precision
)
language sql
stable
security definer
set search_path = public, extensions, pg_catalog
as $$
  with ref as (
    select i.embedding as emb
    from public.images i
    where i.id = reference_id
      and i.embedding is not null
  )
  select
    i.id,
    i.image_url,
    i.tags,
    i.created_at,
    (1 - (i.embedding <=> ref.emb))::double precision as similarity
  from public.images i
  cross join ref
  where i.id <> reference_id
    and i.embedding is not null
  order by i.embedding <=> ref.emb
  limit greatest(1, least(match_count, 100));
$$;

grant execute on function public.match_images_similar_to_reference(uuid, int) to anon, authenticated;
grant execute on function public.match_images_similar_to_reference(uuid, int) to service_role;
