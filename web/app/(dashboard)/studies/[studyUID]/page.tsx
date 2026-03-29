"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import type { Study, Series } from "@/lib/types";
import { formatDicomDate } from "@/lib/dicom-tags";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SeriesList } from "@/components/series-list";

export default function StudyDetailPage({
  params,
}: {
  params: Promise<{ studyUID: string }>;
}) {
  const { studyUID } = use(params);
  const [study, setStudy] = useState<Study | null>(null);
  const [series, setSeries] = useState<Series[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      try {
        const [studiesRes, seriesRes] = await Promise.all([
          fetch(`/app/api/studies?StudyInstanceUID=${studyUID}&limit=1`),
          fetch(`/app/api/studies/${studyUID}/series`),
        ]);

        if (studiesRes.ok) {
          const studies = await studiesRes.json();
          if (studies.length > 0) setStudy(studies[0]);
        }
        if (seriesRes.ok) {
          setSeries(await seriesRes.json());
        }
      } catch {
        // handled by empty state
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [studyUID]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        Loading study...
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <Link
            href="/worklist"
            className="text-sm text-muted-foreground hover:text-foreground mb-2 inline-block"
          >
            &larr; Back to Worklist
          </Link>
          <h2 className="text-xl font-semibold text-foreground">
            {study?.patientName || "Unknown Patient"}
          </h2>
        </div>
        <a
          href={`/viewer/viewer?StudyInstanceUIDs=${studyUID}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          <Button>Open in OHIF Viewer</Button>
        </a>
      </div>

      {study && (
        <Card>
          <CardHeader>
            <CardTitle>Study Information</CardTitle>
          </CardHeader>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Patient ID</p>
              <p className="font-medium text-foreground">{study.patientID || "-"}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Study Date</p>
              <p className="font-medium text-foreground">{formatDicomDate(study.studyDate)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Modality</p>
              <Badge variant="muted">{study.modality || "-"}</Badge>
            </div>
            <div>
              <p className="text-muted-foreground">Description</p>
              <p className="font-medium text-foreground">{study.studyDescription || "-"}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Accession #</p>
              <p className="font-medium text-foreground">{study.accessionNumber || "-"}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Series / Instances</p>
              <p className="font-medium text-foreground">
                {study.numberOfSeries || "?"} / {study.numberOfInstances || "?"}
              </p>
            </div>
          </div>
        </Card>
      )}

      <div>
        <h3 className="text-lg font-semibold text-foreground mb-4">
          Series ({series.length})
        </h3>
        <SeriesList series={series} studyUID={studyUID} />
      </div>
    </div>
  );
}
