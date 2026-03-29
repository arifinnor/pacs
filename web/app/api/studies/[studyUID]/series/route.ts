import { requireAuth, AuthError } from "@/lib/auth";
import { orthancFetch } from "@/lib/orthanc";
import { parseSeries } from "@/lib/dicom-tags";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ studyUID: string }> }
) {
  try {
    await requireAuth();
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
    return Response.json(
      { error: "Failed to fetch series" },
      { status: res.status }
    );
  }

  const raw = await res.json();
  const series = Array.isArray(raw) ? raw.map(parseSeries) : [];

  return Response.json(series);
}
