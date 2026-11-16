import type { NextRequest } from "next/server";

export function GET(request: NextRequest) {
  const tag = request.nextUrl.searchParams.get("tag");

  return Response.json({
    tag,
    relatedTags: ["clean", "type-heavy", "portfolio", "grid"],
  });
}
