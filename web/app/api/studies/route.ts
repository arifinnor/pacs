import { type NextRequest } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth";
import { orthancFetch } from "@/lib/orthanc";
import { parseStudy } from "@/lib/dicom-tags";
import { logAudit } from "@/lib/audit";

export async function GET(request: NextRequest) {
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

  const searchParams = request.nextUrl.searchParams;
  const params = new URLSearchParams();

  const patientName = searchParams.get("PatientName");
  if (patientName) params.set("PatientName", patientName);

  const patientID = searchParams.get("PatientID");
  if (patientID) params.set("PatientID", patientID);

  const studyDate = searchParams.get("StudyDate");
  if (studyDate) params.set("StudyDate", studyDate);

  const modality = searchParams.get("ModalitiesInStudy");
  if (modality) params.set("ModalitiesInStudy", modality);

  const accession = searchParams.get("AccessionNumber");
  if (accession) params.set("AccessionNumber", accession);

  const limit = searchParams.get("limit") || "50";
  const offset = searchParams.get("offset") || "0";
  params.set("limit", limit);
  params.set("offset", offset);

  const queryString = params.toString();
  const res = await orthancFetch(`/dicom-web/studies?${queryString}`);

  if (!res.ok) {
    logAudit({ userId: session.username, userRole: session.role, action: "VIEW_STUDIES", resourceType: "STUDY", ipAddress: ip, success: false, details: `Orthanc error ${res.status}` });
    return Response.json(
      { error: "Failed to fetch studies" },
      { status: res.status }
    );
  }

  const raw = await res.json();
  const studies = Array.isArray(raw) ? raw.map(parseStudy) : [];

  logAudit({ userId: session.username, userRole: session.role, action: "VIEW_STUDIES", resourceType: "STUDY", ipAddress: ip, success: true });
  return Response.json(studies);
}
