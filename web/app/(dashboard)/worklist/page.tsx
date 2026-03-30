"use client";

import { useEffect } from "react";
import { useStudies } from "@/hooks/use-studies";
import { useAuth } from "@/hooks/use-auth";
import { StatsCards } from "@/components/stats-cards";
import { StudyFilters } from "@/components/study-filters";
import { StudyTable } from "@/components/study-table";

export default function WorklistPage() {
  const { user } = useAuth();
  const { studies, isLoading, error, fetchStudies, search, reset } =
    useStudies();

  useEffect(() => {
    if (user) {
      fetchStudies({});
    }
  }, [user, fetchStudies]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground mb-1">
          Study Worklist
        </h2>
        <p className="text-sm text-muted-foreground">
          Search and browse DICOM studies
        </p>
      </div>

      <StatsCards />

      <StudyFilters
        onSearch={search}
        onReset={reset}
        isLoading={isLoading}
      />

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      <StudyTable studies={studies} isLoading={isLoading} />
    </div>
  );
}
