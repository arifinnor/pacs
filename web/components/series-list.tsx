"use client";

import type { Series } from "@/lib/types";
import { Badge } from "@/components/ui/badge";

interface SeriesListProps {
  series: Series[];
  studyUID: string;
}

export function SeriesList({ series, studyUID }: SeriesListProps) {
  if (series.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">No series found</p>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {series.map((s) => (
        <div
          key={s.seriesUID}
          className="rounded-lg border border-border bg-card p-4 hover:border-accent/50 transition-colors"
        >
          <div className="flex items-center justify-between mb-2">
            <Badge variant="muted">{s.modality || "?"}</Badge>
            <span className="text-xs text-muted-foreground">
              #{s.seriesNumber || "-"}
            </span>
          </div>
          <p className="text-sm font-medium text-foreground truncate mb-1">
            {s.seriesDescription || "No description"}
          </p>
          <p className="text-xs text-muted-foreground">
            {s.instanceCount || "?"} instance{s.instanceCount !== "1" ? "s" : ""}
          </p>
          <a
            href={`/viewer/viewer?StudyInstanceUIDs=${studyUID}&SeriesInstanceUIDs=${s.seriesUID}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-block text-xs text-accent hover:underline"
          >
            Open in OHIF
          </a>
        </div>
      ))}
    </div>
  );
}
