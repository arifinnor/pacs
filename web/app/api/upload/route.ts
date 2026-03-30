import { type NextRequest } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth";
import { orthancFetchRaw } from "@/lib/orthanc";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    await requireAuth();
  } catch (e) {
    if (e instanceof AuthError) {
      return Response.json({ error: e.message }, { status: e.status });
    }
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.arrayBuffer();
  if (body.byteLength === 0) {
    return Response.json({ error: "Empty request body" }, { status: 400 });
  }

  const res = await orthancFetchRaw("/instances", {
    method: "POST",
    body,
    headers: { "Content-Type": "application/dicom" },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return Response.json(
      { error: text || `Orthanc error ${res.status}` },
      { status: 502 }
    );
  }

  const data = await res.json();
  // data.Status is "Success" or "AlreadyStored" — both are treated as success
  return Response.json({ id: data.ID, status: data.Status });
}
