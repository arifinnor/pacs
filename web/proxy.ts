import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const accessToken = request.cookies.get("access_token")?.value;
  const refreshToken = request.cookies.get("refresh_token")?.value;

  const isLoginPage = pathname === "/login" || pathname === "/login/";
  const isApiRoute = pathname.startsWith("/api/");

  // Allow API routes to pass through (they handle their own auth)
  if (isApiRoute) {
    return NextResponse.next();
  }

  // Build redirect base using X-Forwarded-Proto so we don't lose https
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  const host = request.headers.get("host") ?? "localhost";
  const base = `${proto}://${host}`;

  // If on login page with valid token, redirect to worklist
  if (isLoginPage && accessToken) {
    return NextResponse.redirect(new URL("/app/worklist", base));
  }

  // If not on login page and no tokens at all, redirect to login
  if (!isLoginPage && !accessToken && !refreshToken) {
    return NextResponse.redirect(new URL("/app/login", base));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
