"use client";

import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";

interface Stats {
  countPatients: number;
  countStudies: number;
  countSeries: number;
  countInstances: number;
  totalDiskSizeMB: string;
  orthancVersion: string;
  dicomAet: string;
}

export function StatsCards() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    fetch("/app/api/stats")
      .then((r) => (r.ok ? r.json() : null))
      .then(setStats)
      .catch(() => setStats(null));
  }, []);

  if (!stats) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="animate-pulse">
            <div className="h-4 w-20 bg-muted rounded mb-2" />
            <div className="h-8 w-12 bg-muted rounded" />
          </Card>
        ))}
      </div>
    );
  }

  const items = [
    { label: "Patients", value: stats.countPatients },
    { label: "Studies", value: stats.countStudies },
    { label: "Series", value: stats.countSeries },
    { label: "Disk Usage", value: `${Number(stats.totalDiskSizeMB).toFixed(1)} MB` },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {items.map((item) => (
        <Card key={item.label}>
          <p className="text-xs text-muted-foreground mb-1">{item.label}</p>
          <p className="text-2xl font-bold text-foreground">{item.value}</p>
        </Card>
      ))}
    </div>
  );
}
