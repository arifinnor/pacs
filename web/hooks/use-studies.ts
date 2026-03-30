"use client";

import { useState, useCallback } from "react";
import type { Study } from "@/lib/types";

interface StudyFilters {
  PatientName?: string;
  PatientID?: string;
  StudyDate?: string;
  ModalitiesInStudy?: string;
  AccessionNumber?: string;
}

export function useStudies() {
  const [studies, setStudies] = useState<Study[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<StudyFilters>({});

  const fetchStudies = useCallback(
    async (searchFilters?: StudyFilters) => {
      setIsLoading(true);
      setError(null);
      const active = searchFilters ?? filters;

      const params = new URLSearchParams();
      if (active.PatientName) params.set("PatientName", active.PatientName);
      if (active.PatientID) params.set("PatientID", active.PatientID);
      if (active.StudyDate) params.set("StudyDate", active.StudyDate);
      if (active.ModalitiesInStudy)
        params.set("ModalitiesInStudy", active.ModalitiesInStudy);
      if (active.AccessionNumber)
        params.set("AccessionNumber", active.AccessionNumber);
      params.set("limit", "100");

      try {
        let res = await fetch(`/app/api/studies?${params.toString()}`);
        if (res.status === 401) {
          const refreshRes = await fetch("/app/api/auth/refresh", { method: "POST" });
          if (refreshRes.ok) {
            res = await fetch(`/app/api/studies?${params.toString()}`);
          }
        }
        if (!res.ok) {
          throw new Error("Failed to fetch studies");
        }
        const data = await res.json();
        setStudies(data);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Unknown error");
        setStudies([]);
      } finally {
        setIsLoading(false);
      }
    },
    [filters]
  );

  const search = useCallback(
    (newFilters: StudyFilters) => {
      setFilters(newFilters);
      fetchStudies(newFilters);
    },
    [fetchStudies]
  );

  const reset = useCallback(() => {
    setFilters({});
    fetchStudies({});
  }, [fetchStudies]);

  return { studies, isLoading, error, filters, fetchStudies, search, reset };
}
