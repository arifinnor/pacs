import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const accessToken = request.cookies.get("access_token")?.value;
  const refreshToken = request.cookies.get("refresh_token")?.value;

  const normalizedPath = pathname.replace(/\/+$/, "") || "/";
  const isLoginPage = normalizedPath === "/login";
  const isApiRoute = pathname.startsWith("/api/");

  if (isApiRoute) {
    return NextResponse.next();
  }

  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  const host = request.headers.get("host") ?? "localhost";
  const base = `${proto}://${host}`;

  if (isLoginPage && accessToken) {
    return NextResponse.redirect(new URL("/app/worklist/", base));
  }

  if (!isLoginPage && !accessToken && !refreshToken) {
    return NextResponse.redirect(new URL("/app/login/", base));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
