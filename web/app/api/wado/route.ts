import { type NextRequest } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth";
import { orthancFetchRaw } from "@/lib/orthanc";

export async function GET(request: NextRequest) {
  try {
    await requireAuth();
  } catch (e) {
    if (e instanceof AuthError) {
      return Response.json({ error: e.message }, { status: e.status });
    }
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const queryString = searchParams.toString();

  const res = await orthancFetchRaw(`/wado?${queryString}`, {
    headers: { Accept: "image/jpeg" },
  });

  if (!res.ok) {
    return new Response("Failed to fetch image", { status: res.status });
  }

  const contentType = res.headers.get("content-type") || "image/jpeg";
  const body = res.body;

  return new Response(body, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=3600",
    },
  });
}
