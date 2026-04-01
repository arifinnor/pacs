import { cookies } from "next/headers";
import { clearAuthCookies, getRefreshToken, getAccessToken, decodeJwtPayload } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

const AUTH_SERVICE_URL =
  process.env.AUTH_SERVICE_URL || "http://auth-service:8000";

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown";

  const accessToken = await getAccessToken();
  const session = accessToken ? decodeJwtPayload(accessToken) : null;

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

  logAudit({ userId: session?.username ?? "unknown", userRole: session?.role, action: "LOGOUT", resourceType: "SESSION", ipAddress: ip, success: true });

  return Response.json({ success: true });
}
