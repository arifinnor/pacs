"use client";

import { useState, useCallback, useEffect } from "react";

const MAX_CONCURRENT = 3;

export type UploadStatus = "pending" | "uploading" | "success" | "failed";

export type UploadFile = {
  id: string;
  file: File;
  status: UploadStatus;
  error?: string;
  orthancId?: string;
};

export function useUploadQueue() {
  const [files, setFiles] = useState<UploadFile[]>([]);

  // Drive the queue: whenever state changes, start uploads for available slots
  useEffect(() => {
    const pending = files.filter((f) => f.status === "pending");
    const uploadingCount = files.filter((f) => f.status === "uploading").length;
    const slots = MAX_CONCURRENT - uploadingCount;

    if (slots <= 0 || pending.length === 0) return;

    const toStart = pending.slice(0, slots);

    // Mark selected files as uploading atomically
    setFiles((prev) =>
      prev.map((f) =>
        toStart.find((t) => t.id === f.id)
          ? { ...f, status: "uploading" as const }
          : f
      )
    );

    // Fire off fetches for each
    toStart.forEach((item) => {
      fetch("/app/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/dicom" },
        body: item.file,
      })
        .then(async (res) => {
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error ?? `HTTP ${res.status}`);
          }
          const data = await res.json();
          setFiles((prev) =>
            prev.map((f) =>
              f.id === item.id
                ? { ...f, status: "success" as const, orthancId: data.id }
                : f
            )
          );
        })
        .catch((err: Error) => {
          setFiles((prev) =>
            prev.map((f) =>
              f.id === item.id
                ? { ...f, status: "failed" as const, error: err.message }
                : f
            )
          );
        });
    });
  }, [files]);

  const addFiles = useCallback((incoming: FileList | File[]) => {
    const newEntries: UploadFile[] = Array.from(incoming).map((file) => ({
      id: crypto.randomUUID(),
      file,
      status: "pending" as const,
    }));
    setFiles((prev) => [...prev, ...newEntries]);
  }, []);

  const retryFile = useCallback((id: string) => {
    setFiles((prev) =>
      prev.map((f) =>
        f.id === id
          ? { ...f, status: "pending" as const, error: undefined, orthancId: undefined }
          : f
      )
    );
  }, []);

  const clearCompleted = useCallback(() => {
    setFiles((prev) => prev.filter((f) => f.status !== "success"));
  }, []);

  return { files, addFiles, retryFile, clearCompleted };
}
