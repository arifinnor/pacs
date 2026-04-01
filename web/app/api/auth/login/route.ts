import { cookies } from "next/headers";
import { setAuthCookies, decodeJwtPayload } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

const AUTH_SERVICE_URL =
  process.env.AUTH_SERVICE_URL || "http://auth-service:8000";

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const body = await request.json();
  const { username, password } = body;

  if (!username || !password) {
    return Response.json(
      { error: "Username and password are required" },
      { status: 400 }
    );
  }

  const res = await fetch(`${AUTH_SERVICE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: "Login failed" }));
    logAudit({ userId: username, action: "LOGIN", resourceType: "SESSION", ipAddress: ip, success: false, details: error.error });
    return Response.json(error, { status: res.status });
  }

  const tokens = await res.json();
  const cookieStore = await cookies();
  await setAuthCookies(cookieStore, tokens);

  const payload = decodeJwtPayload(tokens.access_token);
  logAudit({ userId: payload?.username ?? username, userRole: payload?.role, action: "LOGIN", resourceType: "SESSION", ipAddress: ip, success: true });

  return Response.json({
    user: {
      username: payload?.username,
      role: payload?.role,
    },
  });
}
