import { createHash, timingSafeEqual } from "node:crypto";
import { getServerEnv } from "@/shared/lib/serverEnv";

const MIN_SECRET_LENGTH = 16;

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

function secretsMatch(provided: string, expected: string): boolean {
  // 길이 차이로 정보가 새지 않도록 해시끼리 상수 시간 비교한다.
  return timingSafeEqual(digest(provided), digest(expected));
}

function readProvidedSecret(request: Request): string | null {
  const headerSecret = request.headers.get("x-backfill-secret")?.trim();
  if (headerSecret) {
    return headerSecret;
  }
  const authorization = request.headers.get("authorization")?.trim() ?? "";
  const bearer = /^Bearer\s+(.+)$/i.exec(authorization)?.[1]?.trim();
  return bearer || null;
}

/**
 * 관리용 API(중복 삭제, Storage 동기화, backfill) 전용 서버 인증.
 *
 * - `BACKFILL_SECRET` 이 없거나 너무 짧으면 무조건 거부한다(fail-closed).
 * - 시크릿은 헤더(`x-backfill-secret` 또는 `Authorization: Bearer`)로만 받는다.
 *   쿼리스트링(`?secret=`)은 로그·브라우저 기록에 남으므로 허용하지 않는다.
 *
 * 통과하면 null, 아니면 그대로 반환할 Response 를 돌려준다.
 */
export function requireAdminRequest(request: Request): Response | null {
  const expected = getServerEnv("BACKFILL_SECRET");
  if (!expected || expected.length < MIN_SECRET_LENGTH) {
    return Response.json(
      {
        error: `관리용 API가 비활성화되어 있습니다. .env.local 에 BACKFILL_SECRET(${MIN_SECRET_LENGTH}자 이상)을 설정하고 서버를 재시작하세요.`,
      },
      { status: 503 },
    );
  }

  const provided = readProvidedSecret(request);
  if (!provided || !secretsMatch(provided, expected)) {
    return Response.json({ error: "Unauthorized admin request." }, { status: 401 });
  }

  return null;
}

/** 관리용 API는 상태를 바꾸므로 GET(주소창·링크·프리페치)으로 실행하지 않는다. */
export function adminMethodNotAllowed(): Response {
  return Response.json(
    { error: "이 관리용 API는 POST 요청과 x-backfill-secret 헤더로만 실행할 수 있습니다." },
    { status: 405, headers: { Allow: "POST" } },
  );
}
