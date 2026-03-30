"use client";

import { useRef, useCallback } from "react";
import { useUploadQueue, type UploadFile, type UploadStatus } from "@/hooks/use-upload-queue";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function StatusBadge({ file }: { file: UploadFile }) {
  const styles: Record<UploadStatus, string> = {
    pending: "bg-muted text-muted-foreground",
    uploading: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    success: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    failed: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  };
  const labels: Record<UploadStatus, string> = {
    pending: "Pending",
    uploading: "Uploading…",
    success: "Uploaded",
    failed: "Failed",
  };

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${styles[file.status]}`}
      title={file.status === "failed" ? file.error : undefined}
    >
      {file.status === "uploading" && (
        <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z" />
        </svg>
      )}
      {labels[file.status]}
    </span>
  );
}

export default function UploadPage() {
  const { files, addFiles, retryFile, clearCompleted } = useUploadQueue();
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const dropped = Array.from(e.dataTransfer.files).filter((f) =>
        f.name.toLowerCase().endsWith(".dcm")
      );
      if (dropped.length > 0) addFiles(dropped);
    },
    [addFiles]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        addFiles(e.target.files);
        e.target.value = "";
      }
    },
    [addFiles]
  );

  const successCount = files.filter((f) => f.status === "success").length;
  const failedCount = files.filter((f) => f.status === "failed").length;
  const isDone =
    files.length > 0 &&
    files.every((f) => f.status === "success" || f.status === "failed");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground mb-1">
          Upload DICOM Files
        </h2>
        <p className="text-sm text-muted-foreground">
          Select or drop{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">.dcm</code>{" "}
          files to upload to the PACS archive
        </p>
      </div>

      {isDone && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            failedCount > 0
              ? "border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300"
              : "border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-900/20 dark:text-green-300"
          }`}
        >
          {successCount} file{successCount !== 1 ? "s" : ""} uploaded
          successfully
          {failedCount > 0 && `, ${failedCount} failed`}
        </div>
      )}

      {/* Drop zone */}
      <div
        className="flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-border p-10 text-center cursor-pointer transition-colors hover:border-accent hover:bg-accent/5"
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
      >
        <svg
          className="h-10 w-10 text-muted-foreground"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
          />
        </svg>
        <div>
          <p className="text-sm font-medium text-foreground">
            Drop .dcm files here
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            or click to browse
          </p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".dcm"
          multiple
          className="hidden"
          onChange={handleFileInput}
        />
      </div>

      {/* File table */}
      {files.length > 0 && (
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/40">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {files.length} file{files.length !== 1 ? "s" : ""}
            </span>
            {successCount > 0 && (
              <button
                onClick={clearCompleted}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Clear completed
              </button>
            )}
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">
                  Filename
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">
                  Size
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">
                  Status
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {files.map((f) => (
                <tr
                  key={f.id}
                  className="hover:bg-muted/30 transition-colors"
                >
                  <td
                    className="px-4 py-2 font-mono text-xs text-foreground max-w-xs truncate"
                    title={f.file.name}
                  >
                    {f.file.name}
                  </td>
                  <td className="px-4 py-2 text-xs text-muted-foreground whitespace-nowrap">
                    {formatBytes(f.file.size)}
                  </td>
                  <td className="px-4 py-2">
                    <StatusBadge file={f} />
                  </td>
                  <td className="px-4 py-2">
                    {f.status === "failed" && (
                      <button
                        onClick={() => retryFile(f.id)}
                        className="text-xs text-accent hover:underline"
                      >
                        Retry
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
