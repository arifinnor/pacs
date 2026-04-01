import { type NextRequest } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth";
import { orthancFetch } from "@/lib/orthanc";
import { parseSeries } from "@/lib/dicom-tags";
import { logAudit } from "@/lib/audit";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ studyUID: string }> }
) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  let session;
  try {
    session = await requireAuth();
  } catch (e) {
    if (e instanceof AuthError) {
      return Response.json({ error: e.message }, { status: e.status });
    }
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { studyUID } = await params;

  const res = await orthancFetch(
    `/dicom-web/studies/${studyUID}/series`
  );

  if (!res.ok) {
    logAudit({ userId: session.username, userRole: session.role, action: "VIEW_STUDY", resourceType: "STUDY", resourceId: studyUID, ipAddress: ip, success: false, details: `Orthanc error ${res.status}` });
    return Response.json(
      { error: "Failed to fetch series" },
      { status: res.status }
    );
  }

  const raw = await res.json();
  const series = Array.isArray(raw) ? raw.map(parseSeries) : [];

  logAudit({ userId: session.username, userRole: session.role, action: "VIEW_STUDY", resourceType: "STUDY", resourceId: studyUID, ipAddress: ip, success: true });
  return Response.json(series);
}
