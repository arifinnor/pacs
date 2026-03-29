import { cookies } from "next/headers";
import type { JwtPayload } from "./types";

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: "strict" as const,
  path: "/",
};

export function decodeJwtPayload(token: string): JwtPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf-8")
    );
    return payload as JwtPayload;
  } catch {
    return null;
  }
}

export function isTokenExpired(payload: JwtPayload): boolean {
  return Date.now() >= payload.exp * 1000;
}

export async function setAuthCookies(
  cookieStore: Awaited<ReturnType<typeof cookies>>,
  tokens: { access_token: string; refresh_token: string }
) {
  cookieStore.set("access_token", tokens.access_token, {
    ...COOKIE_OPTIONS,
    maxAge: 900, // 15 minutes
  });
  cookieStore.set("refresh_token", tokens.refresh_token, {
    ...COOKIE_OPTIONS,
    maxAge: 604800, // 7 days
  });
}

export async function clearAuthCookies(
  cookieStore: Awaited<ReturnType<typeof cookies>>
) {
  cookieStore.set("access_token", "", { ...COOKIE_OPTIONS, maxAge: 0 });
  cookieStore.set("refresh_token", "", { ...COOKIE_OPTIONS, maxAge: 0 });
}

export async function getAccessToken(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get("access_token")?.value ?? null;
}

export async function getRefreshToken(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get("refresh_token")?.value ?? null;
}

export async function requireAuth(): Promise<JwtPayload> {
  const token = await getAccessToken();
  if (!token) {
    throw new AuthError("No access token", 401);
  }
  const payload = decodeJwtPayload(token);
  if (!payload || payload.type !== "access") {
    throw new AuthError("Invalid access token", 401);
  }
  if (isTokenExpired(payload)) {
    throw new AuthError("Token expired", 401);
  }
  return payload;
}

export class AuthError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
    this.name = "AuthError";
  }
}
