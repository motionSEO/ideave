# IDEAVE Cursor 인계 문서

이 문서는 Cursor에서 디자이너 **jeongseo**와 나눈 IDEAVE 작업 채팅(긴 세션 + 2026-10-12 연속 작업)과 **현재 워크스페이스 코드**를 바탕으로, 다른 AI(Claude Code)가 이어서 작업할 수 있게 정리한 것이다.

- 작성일: 2026-11-02
- 작성 범위: 이 워크스페이스의 Cursor 대화(압축 요약에 담긴 선행 세션 포함) + 현재 저장소 구조
- **비밀 값(API 키, 토큰, credentials.json / token.json 내용)은 적지 않는다.**
- 기억이 불확실한 항목은 **불확실**로 표시한다.
- 이 문서를 쓰는 턴에서는 **코드를 수정하지 않았다.**

검색 가능한 다른 로컬 대화: 2026-09-22의 「Next.js project analysis」는 구조 설명·Unsplash 테스트 논의였고, 그 턴에서 파일을 수정하지 않았다고 되어 있다. 그 밖의 Cursor 대화가 더 있는지는 **불확실**(인덱스가 이 채팅을 다 담지 않을 수 있음).

---

## 1. 프로젝트 개요

### 목적

**IDEAVE**는 시각 디자인 레퍼런스를 탐색·수집·보드에 올려 보는 **레퍼런스 탐색기**다. 화면 브랜드는 IDEAVE, npm 패키지 이름은 `chillellay-reference`다.

핵심 사용 화면은 **`/` 한 장**이다. 이미지 그리드, 검색, 이미지/텍스트 상세, 우측 캔버스가 한 페이지에 있다.

### 대상 사용자

시각 디자이너(이 프로젝트의 의뢰자 jeongseo). 레퍼런스를 키워드·무드·색으로 찾고, 캔버스에 모아 프로젝트를 잡는다.

### 주요 기능 (현재 코드 기준)

- **탐색 홈**: Drive 수집 DB 우선 메이슨리. 수집 이미지가 부족할 때만 Unsplash로 채움.
- **검색**: 한글/영어 디자인 동의어(타이포↔typography, 포스터↔poster 등). 검색창 해시태그는 수집 DB에서 뽑음.
- **필터**: 전체 / 이미지 / 텍스트.
- **이미지 상세**: 원본 링크, 관련 키워드, 캔버스 저장. 아래 그리드에 관련 레퍼런스.
- **텍스트 상세**: 키워드 정의·기능·반의어·관련 이미지(Gemini `/api/explore/text-detail`).
- **프로젝트 등록**: 주제·무드로 탐색 쿼리·추천 피드.
- **캔버스**: 줌/팬, 드래그 앤 드롭, 멀티셀렉트, 그룹 이동/리사이즈, 공통 키워드 추출, PNG 등 내보내기.
- **만들기**: 로컬 업로드 모달.
- **세션**: `sessionStorage`로 프로젝트/캔버스/검색·상세 일부 유지. 탭을 닫으면 세션이 리셋되는 쪽이 의도였다(Ctrl+R은 유지).
- **안전 필터**: Unsplash/원격 이미지 콘텐츠 세이프티.
- **HTML**: 더블클릭용 정적 셸(`ideave.html`)과 `npm run build:html`로 만드는 `dist/ideave-app.html`. Drive 라이브 데이터는 `:3001` API가 필요.

### 명시적으로 하지 말라고 한 것

- **배포하지 말 것**(Vercel 등). 로컬 `:3001` 기준.
- Unsplash Access Key는 **서버에만**.
- **AI 이미지 생성 API는 쓰지 않음**(분석·태깅·텍스트 정의용 Gemini/임베딩은 사용).

---

## 2. 기술 스택과 폴더 구조

### 스택

| 항목 | 값 |
|------|-----|
| Next.js | **16.2.4** App Router (학습 데이터와 API가 다를 수 있음 → `node_modules/next/dist/docs/` 확인, `AGENTS.md` 참고) |
| React | **19.2.4** |
| 스타일 | Tailwind CSS 4, Pretendard CDN |
| 언어 | TypeScript |
| 외부 SDK | `googleapis` (Drive). Supabase는 REST(`fetch`)로 호출하는 형태. |
| 실행 포트 | **3001** (`npm run dev` / `npm run start`) |

### 루트에서 중요한 것

```
chillellay-reference/
  app/                          # Next App Router
  components/reference-prototype/  # 실제 UI 거의 전부
  lib/                          # Drive, 안전 필터
  shared/lib/                   # Gemini, Supabase, 임베딩, env
  scripts/                      # HTML 빌드, Drive 테스트/메타데이터
  data/google-drive/            # Drive 스냅샷·비전 메타 캐시 (로컬)
  ideave.html                   # 더블클릭용 샘플 셸 (라이브 Drive 아님)
  dist/ideave-app.html          # build:html 산출물
  .env.example                  # 환경변수 이름만
  .env.local                    # 실제 키 (커밋/문서화 금지)
  credentials.json / token.json # Drive OAuth 로컬 파일 (gitignore, 값 적지 말 것)
```

구 라우트 `app/board`, `app/upload`, `app/image/[imageId]`, `app/tag/[tag]`는 남아 있다. **메인 제품 UX는 `app/page.tsx` → `ReferencePrototypePage`.** 이 구 라우트를 아직 쓰는지 여부는 **불확실**(코드는 존재).

### `app/`

| 경로 | 역할 |
|------|------|
| `app/page.tsx` | 홈. `ReferencePrototypePage`를 Suspense로 감쌈 |
| `app/layout.tsx` | 메타데이터, Pretendard, IDEAVE 커서 스타일 |
| `app/globals.css` | 글로벌 CSS / Tailwind |
| `app/api/drive/images` | 개인 DB 이미지 목록(+비전 태그) |
| `app/api/drive/file/[id]` | Drive 파일 프록시 |
| `app/api/unsplash/search` | Unsplash 검색 (키 서버 전용) |
| `app/api/explore/text-detail` | 텍스트 레퍼런스 정의 |
| `app/api/project/analyze` | 프로젝트 문장 분석 |
| `app/api/project/search-suggestions` | 검색 제안 API (UI가 이걸 안 쓰고 DB 해시태그를 쓸 수 있음) |
| `app/api/project/visual-profile` | 프로젝트 시각 프로필 |
| `app/api/images/search` | Supabase 이미지 검색 |
| `app/api/images/similar` | 유사 이미지 |
| `app/api/images/visual-profile` | 이미지 시각 프로필 |
| `app/api/images/dedupe` | 해시 중복 |
| `app/api/board/keywords` | 보드 키워드 |
| `app/api/board/common-keyword` | 보드 공통 키워드 |
| `app/api/tags/generate`, `tags/related` | 태그 생성/연관 |
| `app/api/upload`, `sync-storage` | 업로드·스토리지 동기화 |
| `app/api/backfill-*` | 태그/임베딩/해시 백필 (`BACKFILL_SECRET`) |
| `app/api/health` | 헬스체크 |

### `components/reference-prototype/` (제품 UI)

| 파일 | 역할 |
|------|------|
| `ReferencePrototypePage.tsx` | **본체**. 피드, 검색, 상세, 캔버스, 세션 |
| `ReferenceCard.tsx` | 탐색 카드(뒤집기, 드래그, 클릭→상세) |
| `ExploreReferenceGrid.tsx` | 열 분할 메이슨리 |
| `ImageDetailPanel.tsx` | 이미지 상세 |
| `TextDetailPanel.tsx` | 텍스트 상세 |
| `exploreDetailShared.tsx` | 뒤로가기·타이포 스타일 |
| `BoardCanvasCard.tsx` | 캔버스 위 카드 제스처 |
| `boardResize.ts` / `boardTextSize.ts` / `canvasExport.ts` | 리사이즈, 텍스트 박스,보내기 |
| `homeFeedMix.ts` | Drive 우선 + Unsplash 보충 임계값(32) |
| `referenceKeywords.ts` | 시각 키워드, 관련 이미지 랭킹, 검색 해시태그 |
| `visualSimilarity.ts` | 무드/매체/프로필 유사도 (현재 코드에 존재. **이 Cursor 채팅에서 추가한 시점 불확실**) |
| `projectDesignQueries.ts` | 프로젝트·검색 쿼리 확장 |
| `exploreGrid.ts` | 이미지/텍스트 인터리브, 한글 검색 매칭 |
| `data.ts` | `ReferenceItem` 타입, 폴백 샘플 |
| `ProjectRegisterModal.tsx` / `CreateModal.tsx` | 프로젝트·업로드 |
| `IdeaveLogo.tsx` / `CloseIcon.tsx` / `ideaveCursor.ts` | 로고, 닫기, 커스텀 커서 |

### `lib/` · `shared/lib/`

| 파일 | 역할 |
|------|------|
| `lib/google-drive/auth.ts` | OAuth. **token.json 우선**, 그다음 env. `invalid_grant` 시 브라우저 재인증 |
| `lib/google-drive/personalDb.ts` | 폴더명 `IDEAVE_개인 DB`, 이미지 수집 |
| `lib/google-drive/serverCache.ts` | 메모리+디스크 스냅샷 (`data/google-drive/personal-db-snapshot.json`) |
| `lib/google-drive/metadata/*` | 비전 분석, 한글 렉시콘, 검색, 스토어 |
| `lib/contentSafety.ts` | 피드 안전 필터 |
| `shared/lib/gemini.ts` | Gemini 2.5 Flash-Lite (태깅, 보드 키워드, 텍스트 상세 등) |
| `shared/lib/visualProfile.ts` / `projectVisual.ts` / `visualMedium.ts` | 시각 프로필·매체 |
| `shared/lib/supabaseImages.ts` | Supabase 이미지 REST |
| `shared/lib/openaiEmbedding.ts` | 임베딩 (`OPENAI_API_KEY`) |
| `shared/lib/serverEnv.ts` | `.env.local` 폴백 파서(UTF-16 대응) |
| `shared/lib/adminAuth.ts` | 백필 시크릿 |
| `shared/lib/commonKeywords.ts` | 보드 공통 키워드 규칙 |

### 스크립트

| 명령 | 파일 | 역할 |
|------|------|------|
| `npm run build:html` | `scripts/build-html.mjs` | 단일 HTML (`dist/ideave-app.html`). API는 `<base href>`로 `:3001` |
| `npm run drive:test` | `scripts/test-google-drive.ts` | Drive OAuth/연결 테스트 |
| `npm run drive:metadata` | `scripts/sync-drive-metadata.ts` | Drive 이미지 메타/비전 동기화 |

---

## 3. 작업 이력

긴 세션은 압축되어 **요청 목록은 남아 있고, 요청마다 “이 파일만 고쳤다”는 1:1 로그는 일부 불확실**하다. 아래는 압축 요약에 적힌 요청 순서 + 2026-10-12에 이 채팅에서 확인된 수정이다.

### 3.1 제품 방향 (선행 세션)

| 요청 | 결과 (요약에 기록된 방향) |
|------|---------------------------|
| IDEAVE를 시각 디자인 레퍼런스 탐색기로. 기존 UI 유지 | 메인 페이지 프로토타입 유지 |
| Unsplash 키는 서버만. AI 이미지 API 금지 | `/api/unsplash/search` + 서버 env |
| 배포 준비는 env 인증, Vercel 배포는 하지 않음 | Drive는 token.json / env |
| Drive 우선 메이슨리, Unsplash는 나중·부족할 때만 | `homeFeedMix.ts`, `UNSPLASH_FILL_WHEN_COLLECTED_BELOW = 32` |
| 캔버스 줌/팬, 툴바 오버레이, 리셋 확인 | 보드 UI |
| UT 로고는 추천 유지, 로고 홈 ≠ 전체 리셋 | 로고는 탐색 홈, 별도 리셋 플로우 |
| 키워드 버블, Ctrl+R 시 프로젝트/캔버스/검색·상세 유지, 탭 닫으면 sessionStorage 리셋 | `IdeaveCanvasWorkspaceState` v3 |
| 포트 3001 | `package.json` |
| Unsplash 랭킹을 라이프스타일 쪽으로 | Unsplash 라우트의 시드/필터 (세부 불확실) |
| 새로고침 유지, 상세+필터+메이슨리 통일 | 상세도 같은 그리드 |
| Unsplash 안전 필터 | `contentSafety.ts` |
| 홈 셔플 + 브라우즈 추천 | `homeFeedMix` / browse terms |
| 캔버스 확인·보내기, 그룹 리사이즈, 방향 멀티 리사이즈 | `boardResize`, `canvasExport` |
| 무드 기반 다음 토픽 프로젝트 추천 | 프로젝트 분석 쿼리 |
| 스타일/무드 공통 키워드 다음 구체 디자인어. 공통 키워드 3개, 하프톤/글라스모피즘/패션 포스터. 단독 「질감」「포스터」 금지 | `commonKeywords.ts`, Gemini 보드 키워드 |
| 원본 이미지 링크 | 상세 패널 링크 |
| 관련 키워드 ≥3, 텍스트는 정의 기반 연관 | 텍스트 상세 |
| 텍스트 상세 그리드 믹스, 캔버스 이미지 더블클릭→상세 | `openCanvasImageDetail` |
| 빈 상태 카피, Drive 하프톤 폴더, 멀티셀렉트 그룹 드래그 | 개인 DB 폴더 구조에 의존 |
| 캔버스 랙 완화 | `BoardCanvasCard` 포인터 제스처, 부모 setState 줄임 |
| 전체/이미지/텍스트 아래 sticky 뒤로가기 | `filterChrome` + `ExploreDetailBackButton` |
| 공통 키워드는 폴더 태그가 아니라 비전에서 | Drive metadata vision |
| 프로젝트 검색은 주제+무드 | `projectDesignQueries` |

**이 구간의 수정 파일:** 요약상 위 표의 모듈들이 중심. 커밋 단위 파일 목록은 **불확실**.

### 3.2 이후 명시 요청 (압축 요약 “Later explicit requests”)

| # | 요청 | 요약된 구현 | 관련 파일 (요약·현재 코드) |
|---|------|-------------|----------------------------|
| 1 | 텍스트 상세 제목 잘림. 홈은 Drive 수집 DB 먼저 | `leading-[1.25]`, Drive 대기 후 페인트 | `exploreDetailShared.tsx`, `homeFeedMix.ts`, `ReferencePrototypePage.tsx` |
| 2 | 메인에서 Drive가 잘 안 보임. Unsplash는 정말 부족할 때만 | Drive ≥32면 Unsplash 스킵 | `homeFeedMix.ts` |
| 3 | 한글 검색(타이포/비주얼/시각/포스터) ↔ 영어(typho/visual/poster) | `SYNONYM_GROUPS` | `lib/google-drive/metadata/koreanLexicon.ts` |
| 4 | 관련 추천은 폴더가 아니라 색·무드·그래픽·질감 | `scoreVisualRelatedReference`, 카테고리 무시 | `referenceKeywords.ts` |
| 5 | 검색 해시태그는 하드코드 `#아이콘`이 아니라 수집 DB | `collectCatalogSearchHashtags` | `referenceKeywords.ts`, `ReferencePrototypePage.tsx` |
| 6 | 검색·로드가 너무 느림 | Drive 디스크+세션 캐시, 검색 시 Gemini 스킵, Unsplash 쿼리 1개·타임아웃, 디바운스 | `serverCache.ts`, Unsplash route, `ReferencePrototypePage.tsx` |
| 7 | 더블클릭으로 여는 HTML | `ideave.html` + 이후 `scripts/build-html.mjs` | 루트 HTML, `scripts/build-html.mjs` |
| 8 | 이미지 클릭 후 관련 레퍼런스가 비지 않게. 비슷한 무드/색 | `rankCatalogRelatedImages` | `referenceKeywords.ts` |

**Drive `invalid_grant`:** env refresh token이 만료됐고 env가 token.json보다 우선이라 실패 → `authorizeDriveServer`가 **token.json 먼저**.

### 3.3 이 Cursor 연속 세션에서 확인된 수정 (2026-10-12)

요청자: 이미지 레퍼런스를 눌러도 관련이 안 뜸 / 아무 일도 안 일어남 / 클릭하면 사이트가 멈추고 「응답 없는 페이지」.

| 순서 | 요청 | 원인 | 수정한 파일 | 결과 |
|------|------|------|-------------|------|
| 1 | 관련 그리드가 비지 않게, 무드·색 유사 추천 | 관련도 조건이 너무 빡셈(`minAxes` 등) | `referenceKeywords.ts` (`rankCatalogRelatedImages`, COLOR/MOOD 패밀리), `ReferencePrototypePage.tsx` (`relatedItemsFromCatalog`) | 카탈로그가 있으면 일단 채운 뒤 Unsplash 병합 |
| 2 | 눌러도 아무 일도 없음 | 검색 제안 **전체 화면 오버레이**가 클릭을 가로채고, 닫혀도 포커스가 검색으로 돌아가 다시 열림. 뒤집기 카드 뒷면이 포인터를 먹을 수 있음 | `ReferencePrototypePage.tsx` (`closeSearchSuggestions`, 오버레이 `pointer-events-none`), `ReferenceCard.tsx` (뒷면 `pointer-events-none`, `img draggable={false}`, `role="button"`) | 검색이 떠 있어도 카드 클릭이 상세로 감 |
| 3 | 클릭하면 브라우저가 멈춤 | 상세 진입 **렌더 중**에 카탈로그 전체에 `expandKoreanDesignQuery` / `visualAxisForTerm`을 반복 | `referenceKeywords.ts` (축 룩업 캐시, 랭킹 단순화), `koreanLexicon.ts` (쿼리 캐시, 긴 문자열 전체 매칭 생략), `ReferencePrototypePage.tsx` (렌더는 `otherCatalogImages`만, 랭킹은 `setTimeout(0)` 이후) | 상세가 먼저 열리고 관련은 뒤에서 채움 |

### 3.4 현재 코드에 있으나 이 채팅에서 추가 시점이 불확실한 것

- `visualSimilarity.ts`, `shared/lib/visualProfile.ts`, `visualMedium.ts`, `projectVisual.ts`
- `app/api/images/visual-profile`, `app/api/project/visual-profile`
- `ReferencePrototypePage.tsx`가 위 모듈을 import하는 상태

Oct 12 이후~Nov 2 사이에 다른 에이전트/세션이 넣었을 수 있다. **누가 넣었는지는 불확실.** 이어 작업할 때 이 경로를 기준으로 읽으면 된다.

---

## 4. 설계 결정과 그 이유

| 결정 | 이유 |
|------|------|
| 메인 UX를 `/` 단일 페이지에 둠 | 디자이너가 탐색→상세→캔버스를 한 흐름으로 쓰게 |
| Drive 수집 DB 우선, Unsplash는 32장 미만일 때만 | “내 아카이브가 안 보인다” / 스톡이 홈을 덮는 문제 |
| Unsplash 키는 서버 라우트만 | 클라이언트 노출 금지 |
| AI 이미지 생성 없음 | 명시 요청. Gemini는 태깅·카피·보드 키워드만 |
| 관련 추천은 Drive **폴더/카테고리가 아니라** 색·무드·스타일·질감 | 같은 폴더만 뜨면 탐색이 안 됨 |
| 한글↔영어 동의어 그룹 | 사용자가 「타이포」로 찾고 태그는 `typography`인 경우가 많음 |
| 검색 시 Gemini 분석 스킵, Drive 로컬 필터 먼저 | 키 입력마다 Unsplash+Drive+analyze가 걸려 멈춤 |
| Drive 스냅샷 디스크 캐시 + sessionStorage | 홈 로딩이 매번 Drive 풀 스캔이면 너무 느림 |
| token.json을 env보다 먼저 | 만료된 env refresh token이 로컬 유효 토큰을 가림 |
| 보드 공통 키워드 정확히 3개, 구체 디자인어 | 「질감」「포스터」만 나오면 쓸모 없음 |
| 관련 그리드는 비우지 않음 | 빈 상세가 “고장난 것처럼” 보임 |
| 관련 랭킹을 클릭 렌더에서 빼 지연 | 카탈로그×동의어 확장이 메인 스레드를 수 초 막아 Chrome 무응답 모달 |
| 검색 딤은 `pointer-events-none` | 풀스크린 버튼이 카드 클릭을 삼킴 |
| Ctrl+R은 세션 유지, 탭 종료는 sessionStorage 삭제 | 새로고침 실수 vs 새 방문 |
| 로고 홈 ≠ 전체 리셋 | 실수로 보드/프로젝트를 날리지 않게 |
| 포트 3001 | 3000 충돌·고정 습관 |
| 배포 안 함 | 수업/로컬 작업. HTML은 API 서버가 따로 필요 |
| `BOARD_COMMON_KEYWORD_COUNT = 3` | 요청된 개수 |

---

## 5. 외부 연동 설정 (이름만, 값 금지)

`.env.example` 및 코드의 `getServerEnv` / `process.env` 기준. 값은 `.env.local`에만 둔다.

### 필수에 가까운 것 (기능별)

**Unsplash** (홈 보충·검색·관련 보강)

- `UNSPLASH_ACCESS_KEY` — **Access Key**. Secret Key 아님.

**Google Drive** (수집 DB. 폴더 이름 `IDEAVE_개인 DB`)

아래 둘 중 하나.

1. 로컬 파일: `credentials.json` + `token.json` (서버가 token.json 우선)
2. 환경변수 (셋 다 필요):
   - `GOOGLE_DRIVE_CLIENT_ID` (별칭 `GOOGLE_CLIENT_ID`)
   - `GOOGLE_DRIVE_CLIENT_SECRET` (별칭 `GOOGLE_CLIENT_SECRET`)
   - `GOOGLE_DRIVE_REFRESH_TOKEN` (별칭 `GOOGLE_REFRESH_TOKEN`)

재인증: `npm run drive:test` (로컬 OAuth, redirect `http://localhost:53682/oauth2callback`, 스코프 Drive readonly).

**Gemini** (비전 태그, 텍스트 상세, 보드 키워드, 프로젝트 분석 등)

하나면 됨:

- `GOOGLE_API_KEY`
- 또는 `GEMINI_API_KEY`
- 또는 `GOOGLE_GENERATIVE_AI_API_KEY`
- 코드에 `NEXT_PUBLIC_GOOGLE_API_KEY` 폴백이 있다. **클라이언트에 키를 넣지 않는 편이 맞다.**

모델: `gemini-2.5-flash-lite`.

**Supabase** (업로드, 벡터/유사 검색, 백필 — Drive가 메인 피드여도 라우트는 존재)

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (서버 업로드·백필)
- `SUPABASE_STORAGE_BUCKET` (기본 `images`)

**OpenAI** (임베딩 백필 `/api/backfill-embeddings`)

- `OPENAI_API_KEY`

**백필 보호**

- `BACKFILL_SECRET`

### Drive 로컬 캐시 (비밀은 아니지만 git 주의)

- `data/google-drive/personal-db-snapshot.json`
- `data/google-drive/image-metadata.json`

### 클라이언트에 두면 안 되는 것

- Unsplash Access Key
- Drive client secret / refresh token
- Gemini / OpenAI / Supabase service role

---

## 6. 미완성 · 알려진 문제 · 다음에 하려던 것

### 미완성 / 제약

- **`ideave.html`**: 샘플 Unsplash 셸. 라이브 Drive가 아님.
- **`dist/ideave-app.html`**: UI 번들. `/api/*`와 아이콘은 `<base href>`의 Next 서버(`http://localhost:3001/` 기본) 필요. 서버 없이 완전 오프라인 Drive는 안 됨.
- 구 페이지(` /board`, `/upload` 등)와 메인 프로토타입의 관계가 제품 스펙상 정리됐는지는 **불확실**.
- `app/api/project/search-suggestions`가 UI에서 쓰이는지: 요약에는 “드롭다운에 미사용”으로 되어 있음. **현재도 그런지는 코드 재확인 필요.**

### 알려진 버그 / 회귀 포인트

1. **이미지 클릭 → Chrome 「응답 없는 페이지」**  
   원인: 상세 진입 시 전 카탈로그 관련도 계산. 2026-10-12에 지연·캐시로 완화. **대량 Drive 라이브러리에서 재발 여부 확인 필요.**

2. **이미지 클릭이 무시됨**  
   원인: 검색 오버레이. 완화함. 검색을 연 뒤 카드 클릭·포커스 루프를 다시 볼 것.

3. **관련 그리드가 빈 화면**  
   예전엔 매칭이 너무 엄격. 지금은 카탈로그 다른 이미지로라도 채움. 품질(진짜 비슷한 색/무드인지)은 태그·비전 품질에 달림. 많은 카드가 `#질감 #색감 #구도`만 보이면 랭킹이 약함.

4. **Drive `invalid_grant`**  
   env 토큰 만료. token.json 우선으로 바꿈. env만 쓰는 배포 환경은 **이 채팅에서 검증 안 함.**

5. **필터 바(`전체/이미지/텍스트`)가 `absolute`라 그리드 윗줄을 가릴 수 있음**  
   상세에서 sticky 뒤로가기와 겹침. 클릭이 “안 되는” 것처럼 느껴질 수 있음. **완전히 고쳤는지는 불확실.**

6. **프로젝트 등록 모달이 포커스/세션 복원과 겹쳐 뜨는 경우**를 브라우저 검증 중 봄. 재현 조건은 **불확실**.

7. 홈 그리드 접근성 스냅샷이 매우 커질 수 있음(카드마다 뒤집기 버튼 2개). 성능·a11y 이슈 여지.

### 다음에 하려던 작업 (채팅에 남아 있던 것)

- 이미지 상세 관련 그리드가 **절대 비지 않고** 무드/색 순으로 보이는지, 멈춤 없이 열리는지 **실제 사용으로 재확인**.
- Drive OAuth가 유효한지 (`npm run drive:test`).
- 비전 태그가 부실하면 관련 추천이 동일 폴백 키워드로만 채워짐 → 메타데이터 백필(`npm run drive:metadata`) 품질.
- 배포는 하지 말 것.
- 필터 바와 첫 줄 카드 히트 영역.
- (제품 욕심으로 남아 있을 수 있으나 미합의) 정적 HTML만으로 Drive를 쓰는 것 — **현재 구조와 충돌, 미구현.**

### 검증 시 볼 화면

1. `npm run dev` → `http://localhost:3001`
2. 홈에 Drive 이미지가 보이는지 (32장 이상이면 Unsplash 없이)
3. 검색 「타이포」「포스터」가 영어 태그와 맞는지
4. 이미지 클릭 → 상세가 **즉시** 열리는지, 무응답 모달 없는지
5. 상세 아래 관련 그리드가 비지 않는지
6. 검색창을 연 뒤에도 이미지 클릭이 되는지
7. 캔버스 드래그/멀티셀렉트가 버벅이지 않는지

---

## 7. 실행 방법

작업 디렉터리:

`C:\Users\하정서\Desktop\AI와디자인스튜디오\chillellay-reference\chillellay-reference`

(다른 클론이면 그 루트.)

### 의존성

```bash
npm install
```

### 환경변수

`.env.example`을 보고 `.env.local`을 만든다. **값을 채팅/커밋/이 문서에 붙이지 말 것.**  
Drive는 `.env.local` 대신 `credentials.json` + `token.json`이어도 된다.

키를 바꿨으면 **dev 서버를 완전히 종료했다가** 다시 켠다.

### 개발 서버

```bash
npm run dev
```

브라우저: **http://localhost:3001**

프로덕션 모드:

```bash
npm run build
npm run start
```

역시 포트 **3001**.

### Drive 점검

```bash
npm run drive:test
```

비전/메타 동기화:

```bash
npm run drive:metadata
```

### HTML

더블클릭 샘플(Drive 라이브 아님):

- 프로젝트 루트 `ideave.html`

앱 UI를 한 파일로:

```bash
npm run build:html
```

산출: `dist/ideave-app.html`  
기본 API 베이스: `http://localhost:3001/`  
다른 서버:

```bash
node scripts/build-html.mjs http://127.0.0.1:3001
```

HTML만 열고 API 서버가 꺼져 있으면 검색·Drive·업로드는 실패한다.

### 린트

```bash
npm run lint
```

---

## 8. Claude Code를 위한 짧은 지도

1. UI 버그는 거의 항상 `components/reference-prototype/ReferencePrototypePage.tsx`와 그 옆 파일.
2. Next 16 문서는 `node_modules/next/dist/docs/`.
3. 관련 이미지 로직: `rankCatalogRelatedImages` / `otherCatalogImages`. **렌더 경로에 무거운 랭킹을 다시 넣지 말 것.**
4. 홈 믹스: `needsUnsplashFill` / 32장 임계값.
5. 한글 검색: `koreanLexicon.ts`의 `SYNONYM_GROUPS`.
6. Drive 인증 순서: token.json → env.
7. 사용자(jeongseo)는 디자이너라 **보이는 동작**을 기준으로 말한다. “클릭이 안 됨”은 오버레이·프리즈·빈 그리드일 때가 많았다.
8. 키를 로그하거나 문서에 복사하지 말 것.

---

## 9. 이 문서의 한계

- 선행 세션 521턴은 **압축 요약**이다. 중간 요청의 정확한 일시·파일 diff는 복원하지 못했다.
- Oct 12 이후 코드 변화(`visualSimilarity` 등)의 채팅 근거는 이 스레드에 없다.
- 라이브 Drive/Unsplash/Gemini가 지금 이 머신에서 성공하는지는 이 문서를 쓰는 시점에 재측정하지 않았다.
