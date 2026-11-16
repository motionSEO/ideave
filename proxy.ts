import { NextResponse, type NextRequest } from "next/server";

// Lets the standalone HTML build (dist/ideave-app.html) call /api/* from another origin,
// including file:// pages, which send `Origin: null`.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};

export function proxy(request: NextRequest) {
  if (request.method === "OPTIONS") {
    return NextResponse.json({}, { headers: corsHeaders });
  }

  const response = NextResponse.next();
  Object.entries(corsHeaders).forEach(([key, value]) => response.headers.set(key, value));
  return response;
}

export const config = {
  matcher: "/api/:path*",
};
