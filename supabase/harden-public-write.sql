-- ⚠️ 아직 실행하지 않은 제안 스크립트입니다. 검토 후 Supabase SQL Editor 에서 직접 실행하세요.
--
-- 목적: anon 키(공개 키)만 있으면 누구나 images 테이블에 행을 넣고
--       images 버킷에 파일을 올릴 수 있는 상태를 막는다.
--
-- 전제: 서버(.env.local)에 SUPABASE_SERVICE_ROLE_KEY 가 설정되어 있어야 한다.
--       /api/upload, /api/sync-storage, /api/backfill-* 는 service-role 키로 쓰므로
--       RLS 정책과 무관하게 계속 동작한다.
--
-- 유지되는 것: anon SELECT(목록·검색), 공개 버킷 읽기(이미지 URL 표시) — 화면 기능 영향 없음.
-- 데이터 삭제 없음.

begin;

-- 1) images 테이블: anon INSERT 제거 (SELECT 정책은 유지)
drop policy if exists "Allow anon insert images" on public.images;

-- 2) storage: anon 업로드 제거 (공개 읽기 정책은 유지)
drop policy if exists "Allow anon upload images bucket" on storage.objects;

-- 3) 버킷 자체 제한: 10MB, 래스터 이미지 형식만 (SVG 차단)
update storage.buckets
set
  file_size_limit = 10485760,
  allowed_mime_types = array[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'image/avif', 'image/bmp', 'image/heic', 'image/heif'
  ]
where id = 'images';

commit;

-- (선택) 혹시 수동으로 추가한 anon UPDATE / DELETE 정책이 있다면 확인 후 제거:
-- select policyname, cmd, roles from pg_policies
--   where (schemaname = 'public' and tablename = 'images')
--      or (schemaname = 'storage' and tablename = 'objects');
-- drop policy if exists "Allow anon update images embeddings" on public.images;

-- 되돌리기(롤백)가 필요하면 supabase/setup.sql 의 해당 create policy 블록을 다시 실행하면 된다.
