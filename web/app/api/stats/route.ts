import { requireAuth, AuthError } from "@/lib/auth";
import { orthancFetch } from "@/lib/orthanc";

export async function GET() {
  try {
    await requireAuth();
  } catch (e) {
    if (e instanceof AuthError) {
      return Response.json({ error: e.message }, { status: e.status });
    }
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [statsRes, systemRes] = await Promise.all([
    orthancFetch("/statistics"),
    orthancFetch("/system"),
  ]);

  if (!statsRes.ok) {
    return Response.json(
      { error: "Failed to fetch statistics" },
      { status: statsRes.status }
    );
  }

  const stats = await statsRes.json();
  const system = systemRes.ok ? await systemRes.json() : {};

  return Response.json({
    countPatients: stats.CountPatients ?? 0,
    countStudies: stats.CountStudies ?? 0,
    countSeries: stats.CountSeries ?? 0,
    countInstances: stats.CountInstances ?? 0,
    totalDiskSizeMB: stats.TotalDiskSizeMB ?? "0",
    orthancVersion: system.Version ?? "unknown",
    dicomAet: system.DicomAet ?? "unknown",
  });
}
