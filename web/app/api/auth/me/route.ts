import { getAccessToken } from "@/lib/auth";

const AUTH_SERVICE_URL =
  process.env.AUTH_SERVICE_URL || "http://auth-service:8000";

export async function GET() {
  const token = await getAccessToken();

  if (!token) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const res = await fetch(`${AUTH_SERVICE_URL}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    return Response.json({ error: "Failed to fetch user" }, { status: res.status });
  }

  const user = await res.json();
  return Response.json(user);
}
