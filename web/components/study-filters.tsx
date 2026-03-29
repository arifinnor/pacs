"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface StudyFiltersProps {
  onSearch: (filters: Record<string, string>) => void;
  onReset: () => void;
  isLoading: boolean;
}

const MODALITIES = ["CT", "MR", "CR", "DX", "US", "XA", "NM", "PT", "MG", "RF"];

export function StudyFilters({ onSearch, onReset, isLoading }: StudyFiltersProps) {
  const [patientName, setPatientName] = useState("");
  const [patientID, setPatientID] = useState("");
  const [studyDate, setStudyDate] = useState("");
  const [modality, setModality] = useState("");
  const [accessionNumber, setAccessionNumber] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const filters: Record<string, string> = {};
    if (patientName) filters.PatientName = `*${patientName}*`;
    if (patientID) filters.PatientID = patientID;
    if (studyDate) filters.StudyDate = studyDate.replace(/-/g, "");
    if (modality) filters.ModalitiesInStudy = modality;
    if (accessionNumber) filters.AccessionNumber = accessionNumber;
    onSearch(filters);
  };

  const handleReset = () => {
    setPatientName("");
    setPatientID("");
    setStudyDate("");
    setModality("");
    setAccessionNumber("");
    onReset();
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
      <Input
        label="Patient Name"
        id="patientName"
        placeholder="Search..."
        value={patientName}
        onChange={(e) => setPatientName(e.target.value)}
        className="w-44"
      />
      <Input
        label="Patient ID"
        id="patientID"
        placeholder="ID..."
        value={patientID}
        onChange={(e) => setPatientID(e.target.value)}
        className="w-32"
      />
      <Input
        label="Study Date"
        id="studyDate"
        type="date"
        value={studyDate}
        onChange={(e) => setStudyDate(e.target.value)}
        className="w-40"
      />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="modality" className="text-sm text-muted-foreground">
          Modality
        </label>
        <select
          id="modality"
          value={modality}
          onChange={(e) => setModality(e.target.value)}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50"
        >
          <option value="">All</option>
          {MODALITIES.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      </div>
      <Input
        label="Accession #"
        id="accessionNumber"
        placeholder="ACC..."
        value={accessionNumber}
        onChange={(e) => setAccessionNumber(e.target.value)}
        className="w-32"
      />
      <Button type="submit" disabled={isLoading}>
        {isLoading ? "Searching..." : "Search"}
      </Button>
      <Button type="button" variant="outline" onClick={handleReset}>
        Reset
      </Button>
    </form>
  );
}
