# 06 — DICOM Viewer Integration

## Decision: OHIF vs Cornerstone3D

| | OHIF Viewer | Cornerstone3D |
|--|-------------|---------------|
| What it is | Full radiology workstation | Rendering library |
| Integration | Standalone app, embed via iframe or run alongside | React components, embed directly in Next.js |
| Effort | Low — configure and point at Orthanc | High — build your own viewer UI |
| Flexibility | Low — OHIF's UI is OHIF's UI | High — full control |
| Radiology features | Complete (MPR, fusion, measurements, SR) | You build what you need |
| Best for | Radiologists needing a full reading workstation | Custom portals, limited feature sets |

**Recommendation for your use case (hospital PACS, radiologists):** Start with OHIF.
Radiologists expect a full feature set. Building it yourself with Cornerstone3D takes months.
OHIF runs alongside Orthanc, and you link to it from your Next.js worklist.

---

## Option A: OHIF Viewer (recommended)

### Add OHIF to docker-compose.yml

```yaml
  ohif:
    image: ohif/app:latest
    container_name: ohif-viewer
    ports:
      - "3001:80"
    volumes:
      - ./ohif/app-config.js:/usr/share/nginx/html/app-config.js:ro
    restart: unless-stopped
```

### ohif/app-config.js

```javascript
window.config = {
  routerBasename: '/',
  showStudyList: true,
  extensions: [],
  modes: [],
  customizationService: {},
  defaultDataSourceName: 'dicomweb',
  dataSources: [
    {
      namespace: '@ohif/extension-default.dataSourcesModule.dicomweb',
      sourceName: 'dicomweb',
      configuration: {
        friendlyName: 'Hospital PACS',
        name: 'DCM4CHEE',
        wadoUriRoot: 'https://your-domain.com/orthanc/wado',
        qidoRoot: 'https://your-domain.com/orthanc/dicom-web',
        wadoRoot: 'https://your-domain.com/orthanc/dicom-web',
        qidoSupportsIncludeField: false,
        supportsReject: false,
        imageRendering: 'wadors',
        thumbnailRendering: 'wadors',
        enableStudyLazyLoad: true,
        supportsFuzzyMatching: false,
        supportsWildcard: true,
        staticWado: false,
        singlepart: 'bulkdata,video,pdf',
        requestOptions: {
          // In production, replace with JWT token from your auth service
          auth: 'admin:your_password',
        },
      },
    },
  ],
  investigationalUseDialog: {
    option: 'never',
  },
  showLoadingIndicator: true,
  strictZSpacingForVolumeViewport: true,
}
```

> **IMPORTANT**: The `auth` field above uses basic auth. In production, replace with JWT token injection from your auth service. Never ship basic auth credentials in a client-side config file.

### Link to OHIF from Next.js worklist

```typescript
// When a radiologist clicks a study in your worklist:
function openInViewer(studyUID: string) {
  const viewerUrl = `http://your-domain.com:3001/viewer?StudyInstanceUIDs=${studyUID}`
  window.open(viewerUrl, '_blank')
}
```

Or embed via iframe (for same-page experience):
```tsx
<iframe
  src={`/viewer?StudyInstanceUIDs=${studyUID}`}
  style={{ width: '100%', height: '100vh', border: 'none' }}
  title="DICOM Viewer"
/>
```

### Verify OHIF works
1. Open `http://localhost:3001`
2. OHIF study list should show the same studies as Orthanc
3. Click a study — images should load and render
4. Check browser console for errors — 401 means auth wrong, 404 means URL wrong

---

## Option B: Cornerstone3D (if you need custom UI)

Only use this if OHIF's UI doesn't fit your requirements.

### Install dependencies

```bash
npm install @cornerstonejs/core @cornerstonejs/tools @cornerstonejs/dicom-image-loader
npm install dicom-parser
```

### Basic WADO-RS image loader setup

```typescript
// lib/cornerstone/init.ts
import * as cornerstone from '@cornerstonejs/core'
import * as cornerstoneTools from '@cornerstonejs/tools'
import cornerstoneDICOMImageLoader from '@cornerstonejs/dicom-image-loader'
import dicomParser from 'dicom-parser'

let initialized = false

export async function initCornerstone() {
  if (initialized) return
  initialized = true

  cornerstoneDICOMImageLoader.external.cornerstone = cornerstone
  cornerstoneDICOMImageLoader.external.dicomParser = dicomParser

  cornerstoneDICOMImageLoader.configure({
    useWebWorkers: true,
    decodeConfig: {
      convertFloatPixelDataToInt: false,
      use16BitDataType: true,
    },
  })

  await cornerstone.init()
  cornerstoneTools.init()
}
```

### Basic CT viewer component

```typescript
// components/DicomViewer.tsx
'use client'

import { useEffect, useRef } from 'react'
import * as cornerstone from '@cornerstonejs/core'
import * as cornerstoneTools from '@cornerstonejs/tools'
import { initCornerstone } from '@/lib/cornerstone/init'

interface DicomViewerProps {
  studyUID: string
  seriesUID: string
  instanceUIDs: string[]
}

export function DicomViewer({ studyUID, seriesUID, instanceUIDs }: DicomViewerProps) {
  const viewportRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!viewportRef.current) return

    let renderingEngine: cornerstone.RenderingEngine | null = null

    async function setupViewer() {
      await initCornerstone()

      const imageIds = instanceUIDs.map(uid =>
        // These go through your Next.js proxy, not directly to Orthanc
        `wadors:${window.location.origin}/api/dicom-web/studies/${studyUID}/series/${seriesUID}/instances/${uid}`
      )

      renderingEngine = new cornerstone.RenderingEngine('pacs-engine')

      const viewportInput = {
        viewportId: 'CT_AXIAL',
        element: viewportRef.current!,
        type: cornerstone.Enums.ViewportType.STACK,
      }

      renderingEngine.enableElement(viewportInput)

      const viewport = renderingEngine.getViewport('CT_AXIAL') as cornerstone.Types.IStackViewport
      await viewport.setStack(imageIds)
      viewport.render()
    }

    setupViewer()

    return () => {
      renderingEngine?.destroy()
    }
  }, [studyUID, seriesUID, instanceUIDs])

  return (
    <div
      ref={viewportRef}
      style={{
        width: '512px',
        height: '512px',
        backgroundColor: 'black',
      }}
    />
  )
}
```

### WADO-RS proxy API route (required for Cornerstone3D)

Cornerstone3D fetches multi-part DICOM data. You need a proxy route that handles this correctly:

```typescript
// app/api/dicom-web/studies/[studyUID]/series/[seriesUID]/instances/[instanceUID]/route.ts
import { NextRequest, NextResponse } from 'next/server'

const ORTHANC_URL = process.env.ORTHANC_URL!

type Params = { studyUID: string; seriesUID: string; instanceUID: string }

export async function GET(
  req: NextRequest,
  { params }: { params: Params }
) {
  const { studyUID, seriesUID, instanceUID } = params
  const accept = req.headers.get('accept') || 'application/dicom'

  const credentials = Buffer.from(
    `${process.env.ORTHANC_USERNAME}:${process.env.ORTHANC_PASSWORD}`
  ).toString('base64')

  const orthancRes = await fetch(
    `${ORTHANC_URL}/dicom-web/studies/${studyUID}/series/${seriesUID}/instances/${instanceUID}`,
    {
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Accept': accept,
      },
    }
  )

  if (!orthancRes.ok) {
    return new NextResponse(null, { status: orthancRes.status })
  }

  // Pass through the response with original Content-Type
  // Cornerstone3D needs the multipart boundary intact
  const body = await orthancRes.arrayBuffer()
  return new NextResponse(body, {
    headers: {
      'Content-Type': orthancRes.headers.get('Content-Type') || 'application/dicom',
    },
  })
}
```

---

## Common failure modes

| Symptom | Cause | Fix |
|---------|-------|-----|
| OHIF shows empty study list | Wrong qidoRoot URL | Check path includes `/dicom-web` |
| Images don't load in OHIF | Wrong wadoRoot or auth | Check browser network tab for 401/404 |
| Cornerstone throws "Unable to load image" | WADO-RS proxy not working | Test proxy URL directly in curl |
| Images load but look wrong (inverted/dark) | Transfer syntax not handled | Orthanc may need to transcode; check Cornerstone3D transfer syntax support |
| OHIF shows "No instances" for a series | Series has no instances in Orthanc | Verify via `/dicom-web/studies/{uid}/series/{uid}/instances` |

---

## Done when
- [ ] OHIF loads and shows study list at localhost:3001
- [ ] Clicking a study in OHIF renders the CT/MRI images
- [ ] Link from Next.js worklist opens OHIF for the correct study
- [ ] No 401 or 404 errors in browser console
