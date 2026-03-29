import { cookies } from "next/headers";
import { setAuthCookies, clearAuthCookies, getRefreshToken } from "@/lib/auth";

const AUTH_SERVICE_URL =
  process.env.AUTH_SERVICE_URL || "http://auth-service:8000";

export async function POST() {
  const refreshToken = await getRefreshToken();

  if (!refreshToken) {
    return Response.json({ error: "No refresh token" }, { status: 401 });
  }

  const res = await fetch(`${AUTH_SERVICE_URL}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });

  const cookieStore = await cookies();

  if (!res.ok) {
    await clearAuthCookies(cookieStore);
    return Response.json({ error: "Refresh failed" }, { status: 401 });
  }

  const tokens = await res.json();
  await setAuthCookies(cookieStore, tokens);

  return Response.json({ success: true });
}
