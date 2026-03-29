"use client";

import Link from "next/link";
import type { Study } from "@/lib/types";
import { formatDicomDate } from "@/lib/dicom-tags";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface StudyTableProps {
  studies: Study[];
  isLoading: boolean;
}

export function StudyTable({ studies, isLoading }: StudyTableProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        Loading studies...
      </div>
    );
  }

  if (studies.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        No studies found
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/50">
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Patient Name</th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Patient ID</th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Study Date</th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Modality</th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Description</th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Series</th>
            <th className="px-4 py-3 text-right font-medium text-muted-foreground">Actions</th>
          </tr>
        </thead>
        <tbody>
          {studies.map((study) => (
            <tr
              key={study.studyUID}
              className="border-b border-border hover:bg-muted/30 transition-colors"
            >
              <td className="px-4 py-3 font-medium text-foreground">
                {study.patientName || "Unknown"}
              </td>
              <td className="px-4 py-3 text-muted-foreground">
                {study.patientID || "-"}
              </td>
              <td className="px-4 py-3 text-muted-foreground">
                {formatDicomDate(study.studyDate)}
              </td>
              <td className="px-4 py-3">
                <Badge variant="muted">{study.modality || "-"}</Badge>
              </td>
              <td className="px-4 py-3 text-muted-foreground max-w-[200px] truncate">
                {study.studyDescription || "-"}
              </td>
              <td className="px-4 py-3 text-muted-foreground">
                {study.numberOfSeries || "-"}
              </td>
              <td className="px-4 py-3 text-right">
                <div className="flex items-center justify-end gap-2">
                  <Link href={`/studies/${study.studyUID}`}>
                    <Button variant="ghost" size="sm">
                      Details
                    </Button>
                  </Link>
                  <a
                    href={`/viewer/viewer?StudyInstanceUIDs=${study.studyUID}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Button variant="outline" size="sm">
                      View in OHIF
                    </Button>
                  </a>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
