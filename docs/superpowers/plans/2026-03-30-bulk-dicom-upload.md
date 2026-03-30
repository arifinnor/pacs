# Bulk DICOM Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/app/upload` page where authenticated staff can select multiple `.dcm` files, track per-file upload progress, and retry individual failures — backed by a new `POST /api/upload` route that proxies files to Orthanc `POST /instances`.

**Architecture:** The browser uploads each DICOM file as a separate request to a Next.js API route, with up to 3 concurrent uploads managed by a client-side queue hook. The API route reads the raw binary body and forwards it to Orthanc with Basic Auth injected server-side.

**Tech Stack:** Next.js 16 App Router, TypeScript, Tailwind CSS, React hooks (useState/useEffect/useCallback/useRef), Orthanc REST API

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `web/app/api/upload/route.ts` | Create | Accept one DICOM file, proxy to Orthanc `/instances`, return `{ id, status }` |
| `web/hooks/use-upload-queue.ts` | Create | Queue state, concurrency (max 3), per-file status, retry logic |
| `web/app/(dashboard)/upload/page.tsx` | Create | Drop zone, file table, summary bar — consumes `useUploadQueue` |
| `web/components/sidebar.tsx` | Modify | Add "Upload" nav item to `navItems` array |

**Note:** nginx already has `client_max_body_size 500M` at the server block level — no nginx changes required.

---

## Task 1: API Route — `POST /api/upload`

**Files:**
- Create: `web/app/api/upload/route.ts`

- [ ] **Step 1: Create the route file**

```typescript
// web/app/api/upload/route.ts
import { type NextRequest } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth";
import { orthancFetchRaw } from "@/lib/orthanc";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    await requireAuth();
  } catch (e) {
    if (e instanceof AuthError) {
      return Response.json({ error: e.message }, { status: e.status });
    }
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.arrayBuffer();
  if (body.byteLength === 0) {
    return Response.json({ error: "Empty request body" }, { status: 400 });
  }

  const res = await orthancFetchRaw("/instances", {
    method: "POST",
    body,
    headers: { "Content-Type": "application/dicom" },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return Response.json(
      { error: text || `Orthanc error ${res.status}` },
      { status: 502 }
    );
  }

  const data = await res.json();
  // data.Status is "Success" or "AlreadyStored" — both are fine
  return Response.json({ id: data.ID, status: data.Status });
}
```

- [ ] **Step 2: Verify the route manually**

With the stack running (`docker compose up -d`), upload a test DICOM file:

```bash
# Should return 401 (no auth cookie)
curl -s -X POST https://localhost/app/api/upload \
  --data-binary @orthanc/test.dcm \
  -H "Content-Type: application/dicom" -k
# Expected: {"error":"No access token"}

# Login to get a cookie, then upload
TOKEN=$(curl -s -X POST https://localhost/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"<ADMIN_PASSWORD>"}' -k \
  | jq -r '.access_token')

curl -s -X POST https://localhost/app/api/upload \
  --data-binary @orthanc/test.dcm \
  -H "Content-Type: application/dicom" \
  -H "Cookie: access_token=$TOKEN" -k
# Expected: {"id":"<orthanc-uuid>","status":"Success"} or "AlreadyStored"
```

- [ ] **Step 3: Commit**

```bash
git add web/app/api/upload/route.ts
git commit -m "feat: add POST /api/upload route proxying to Orthanc /instances"
```

---

## Task 2: Upload Queue Hook

**Files:**
- Create: `web/hooks/use-upload-queue.ts`

- [ ] **Step 1: Create the hook**

```typescript
// web/hooks/use-upload-queue.ts
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
```

- [ ] **Step 2: Commit**

```bash
git add web/hooks/use-upload-queue.ts
git commit -m "feat: add useUploadQueue hook with concurrency and retry"
```

---

## Task 3: Upload Page

**Files:**
- Create: `web/app/(dashboard)/upload/page.tsx`

- [ ] **Step 1: Create the page**

```typescript
// web/app/(dashboard)/upload/page.tsx
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
        // Reset input so same files can be re-selected if needed
        e.target.value = "";
      }
    },
    [addFiles]
  );

  const successCount = files.filter((f) => f.status === "success").length;
  const failedCount = files.filter((f) => f.status === "failed").length;
  const isDone = files.length > 0 && files.every((f) => f.status === "success" || f.status === "failed");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground mb-1">Upload DICOM Files</h2>
        <p className="text-sm text-muted-foreground">
          Select or drop <code className="rounded bg-muted px-1 py-0.5 text-xs">.dcm</code> files to upload to the PACS archive
        </p>
      </div>

      {isDone && (
        <div className={`rounded-lg border px-4 py-3 text-sm ${failedCount > 0 ? "border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300" : "border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-900/20 dark:text-green-300"}`}>
          {successCount} file{successCount !== 1 ? "s" : ""} uploaded successfully
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
        <svg className="h-10 w-10 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
        </svg>
        <div>
          <p className="text-sm font-medium text-foreground">Drop .dcm files here</p>
          <p className="text-xs text-muted-foreground mt-1">or click to browse</p>
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
                <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Filename</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Size</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {files.map((f) => (
                <tr key={f.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-2 font-mono text-xs text-foreground max-w-xs truncate" title={f.file.name}>
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
```

- [ ] **Step 2: Verify the page loads**

Navigate to `https://localhost/app/upload` in a browser (logged in). Confirm:
- Page renders with drop zone and header
- No console errors

- [ ] **Step 3: Commit**

```bash
git add web/app/(dashboard)/upload/page.tsx
git commit -m "feat: add /upload page with drag-and-drop and per-file status table"
```

---

## Task 4: Sidebar Nav Item

**Files:**
- Modify: `web/components/sidebar.tsx`

- [ ] **Step 1: Add "Upload" to navItems**

In `web/components/sidebar.tsx`, update the `navItems` array (currently lines 6–9) to:

```typescript
const navItems = [
  { href: "/worklist", label: "Worklist", icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" },
  { href: "/upload", label: "Upload", icon: "M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" },
  { href: "/profile", label: "Profile", icon: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" },
];
```

- [ ] **Step 2: Verify sidebar renders correctly**

Reload the app. Confirm:
- "Upload" appears between "Worklist" and "Profile"
- Clicking it navigates to `/app/upload`
- The upload icon (upward arrow) is visible
- Active state highlights correctly when on `/app/upload`

- [ ] **Step 3: Commit**

```bash
git add web/components/sidebar.tsx
git commit -m "feat: add Upload nav item to sidebar"
```

---

## End-to-End Verification

```bash
docker compose up -d --build
```

1. Log in → sidebar shows Worklist / **Upload** / Profile
2. Click Upload → `/app/upload` loads with drop zone
3. Select 5 `.dcm` files → all appear as "Pending"
4. Check browser Network tab → max 3 simultaneous POST `/app/api/upload` requests
5. All files eventually show "Uploaded" (green badge)
6. Select same files again → "AlreadyStored" still shows as "Uploaded" (success)
7. Stop Orthanc (`docker compose stop orthanc`), upload a file → "Failed" badge with error message
8. Click "Retry" → file re-attempts, fails again (Orthanc still down)
9. Start Orthanc again (`docker compose start orthanc`), click "Retry" → file succeeds
10. Click "Clear completed" → successful entries removed, failed entries remain
11. Unauthenticated: `curl -X POST https://localhost/app/api/upload -k` → `{"error":"No access token"}`
