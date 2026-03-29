import type { Study, Series } from "./types";

export const TAGS = {
  StudyInstanceUID: "0020000D",
  SeriesInstanceUID: "0020000E",
  SOPInstanceUID: "00080018",
  PatientName: "00100010",
  PatientID: "00100020",
  PatientBirthDate: "00100030",
  PatientSex: "00100040",
  StudyDate: "00080020",
  StudyTime: "00080030",
  AccessionNumber: "00080050",
  Modality: "00080060",
  ModalitiesInStudy: "00080061",
  StudyDescription: "00081030",
  SeriesDescription: "0008103E",
  SeriesNumber: "00200011",
  NumberOfStudyRelatedSeries: "00201206",
  NumberOfStudyRelatedInstances: "00201208",
  NumberOfSeriesRelatedInstances: "00201209",
} as const;

export function getTagValue(
  obj: Record<string, unknown>,
  tag: string
): string {
  const entry = obj[tag] as
    | { Value?: Array<unknown> }
    | undefined;
  if (!entry?.Value?.length) return "";
  const val = entry.Value[0];
  if (typeof val === "string") return val;
  if (typeof val === "number") return String(val);
  return "";
}

export function getPatientName(obj: Record<string, unknown>): string {
  const entry = obj[TAGS.PatientName] as
    | { Value?: Array<{ Alphabetic?: string }> }
    | undefined;
  if (!entry?.Value?.length) return "";
  return entry.Value[0]?.Alphabetic ?? "";
}

export function formatDicomDate(dateStr: string): string {
  if (!dateStr || dateStr.length !== 8) return dateStr;
  const year = dateStr.slice(0, 4);
  const month = dateStr.slice(4, 6);
  const day = dateStr.slice(6, 8);
  return `${year}-${month}-${day}`;
}

export function parseStudy(raw: Record<string, unknown>): Study {
  return {
    studyUID: getTagValue(raw, TAGS.StudyInstanceUID),
    patientName: getPatientName(raw),
    patientID: getTagValue(raw, TAGS.PatientID),
    studyDate: getTagValue(raw, TAGS.StudyDate),
    studyTime: getTagValue(raw, TAGS.StudyTime),
    modality: getTagValue(raw, TAGS.ModalitiesInStudy) || getTagValue(raw, TAGS.Modality),
    studyDescription: getTagValue(raw, TAGS.StudyDescription),
    accessionNumber: getTagValue(raw, TAGS.AccessionNumber),
    numberOfSeries: getTagValue(raw, TAGS.NumberOfStudyRelatedSeries),
    numberOfInstances: getTagValue(raw, TAGS.NumberOfStudyRelatedInstances),
  };
}

export function parseSeries(raw: Record<string, unknown>): Series {
  return {
    seriesUID: getTagValue(raw, TAGS.SeriesInstanceUID),
    modality: getTagValue(raw, TAGS.Modality),
    seriesNumber: getTagValue(raw, TAGS.SeriesNumber),
    seriesDescription: getTagValue(raw, TAGS.SeriesDescription),
    instanceCount: getTagValue(raw, TAGS.NumberOfSeriesRelatedInstances),
  };
}
