import { cookies } from "next/headers";
import { clearAuthCookies, getRefreshToken } from "@/lib/auth";

const AUTH_SERVICE_URL =
  process.env.AUTH_SERVICE_URL || "http://auth-service:8000";

export async function POST() {
  const refreshToken = await getRefreshToken();

  if (refreshToken) {
    await fetch(`${AUTH_SERVICE_URL}/auth/logout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    }).catch(() => {});
  }

  const cookieStore = await cookies();
  await clearAuthCookies(cookieStore);

  return Response.json({ success: true });
}
