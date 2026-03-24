# 05 — DICOMweb + Next.js Integration

## Architecture

Next.js never talks to Orthanc directly from the browser in production.
All DICOMweb requests are proxied through Next.js API routes to avoid:
- Exposing Orthanc credentials to the browser
- CORS issues
- Bypassing auth

```
Browser → Next.js API route → Orthanc DICOMweb
```

In development, you can proxy directly via `next.config.js` rewrites.

---

## Environment variables for Next.js

```bash
# .env.local
ORTHANC_URL=http://orthanc:8042
ORTHANC_USERNAME=admin
ORTHANC_PASSWORD=your_password

# For JWT-based auth (production)
ORTHANC_JWT_SECRET=your_jwt_secret
```

---

## next.config.js — dev proxy (optional but convenient)

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/dicom-web/:path*',
        destination: `${process.env.ORTHANC_URL}/dicom-web/:path*`,
      },
    ]
  },
}

module.exports = nextConfig
```

This only works in development where `ORTHANC_URL=http://localhost:8042`.
In production, use proper API routes with auth headers.

---

## API route: study list (worklist)

```typescript
// app/api/studies/route.ts
import { NextRequest, NextResponse } from 'next/server'

const ORTHANC_URL = process.env.ORTHANC_URL!
const ORTHANC_USERNAME = process.env.ORTHANC_USERNAME!
const ORTHANC_PASSWORD = process.env.ORTHANC_PASSWORD!

function orthancHeaders(): HeadersInit {
  const credentials = Buffer.from(`${ORTHANC_USERNAME}:${ORTHANC_PASSWORD}`).toString('base64')
  return {
    'Authorization': `Basic ${credentials}`,
    'Accept': 'application/json',
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)

  // Forward allowed QIDO-RS query params
  const allowedParams = ['PatientName', 'PatientID', 'StudyDate', 'ModalitiesInStudy', 'limit', 'offset']
  const query = new URLSearchParams()

  for (const param of allowedParams) {
    const value = searchParams.get(param)
    if (value) query.set(param, value)
  }

  // Default limit to prevent huge responses
  if (!query.has('limit')) query.set('limit', '50')

  const orthancRes = await fetch(
    `${ORTHANC_URL}/dicom-web/studies?${query.toString()}`,
    { headers: orthancHeaders() }
  )

  if (!orthancRes.ok) {
    return NextResponse.json(
      { error: 'Failed to fetch studies from PACS' },
      { status: orthancRes.status }
    )
  }

  const studies = await orthancRes.json()
  return NextResponse.json(studies)
}
```

### Verification
```bash
# Start Next.js dev server, then:
curl http://localhost:3000/api/studies
# Expected: JSON array of studies

curl "http://localhost:3000/api/studies?PatientName=Santoso*"
# Expected: filtered JSON array
```

---

## API route: series list for a study

```typescript
// app/api/studies/[studyUID]/series/route.ts
import { NextRequest, NextResponse } from 'next/server'

const ORTHANC_URL = process.env.ORTHANC_URL!

function orthancHeaders(): HeadersInit {
  const credentials = Buffer.from(
    `${process.env.ORTHANC_USERNAME}:${process.env.ORTHANC_PASSWORD}`
  ).toString('base64')
  return { 'Authorization': `Basic ${credentials}` }
}

export async function GET(
  req: NextRequest,
  { params }: { params: { studyUID: string } }
) {
  const { studyUID } = params

  const res = await fetch(
    `${ORTHANC_URL}/dicom-web/studies/${studyUID}/series`,
    { headers: orthancHeaders() }
  )

  if (!res.ok) {
    return NextResponse.json({ error: 'Series not found' }, { status: res.status })
  }

  return NextResponse.json(await res.json())
}
```

---

## API route: proxy rendered image (for thumbnails)

```typescript
// app/api/wado/route.ts
// Proxies WADO-URI requests (single-image rendered JPEG/PNG)
import { NextRequest, NextResponse } from 'next/server'

const ORTHANC_URL = process.env.ORTHANC_URL!

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)

  // WADO-URI required params
  const requestType = searchParams.get('requestType')
  const studyUID = searchParams.get('studyUID')
  const seriesUID = searchParams.get('seriesUID')
  const objectUID = searchParams.get('objectUID')
  const contentType = searchParams.get('contentType') || 'image/jpeg'

  if (requestType !== 'WADO' || !studyUID || !seriesUID || !objectUID) {
    return NextResponse.json({ error: 'Missing required WADO params' }, { status: 400 })
  }

  const credentials = Buffer.from(
    `${process.env.ORTHANC_USERNAME}:${process.env.ORTHANC_PASSWORD}`
  ).toString('base64')

  const orthancRes = await fetch(
    `${ORTHANC_URL}/wado?requestType=WADO&studyUID=${studyUID}&seriesUID=${seriesUID}&objectUID=${objectUID}&contentType=${contentType}`,
    { headers: { 'Authorization': `Basic ${credentials}` } }
  )

  if (!orthancRes.ok) {
    return new NextResponse(null, { status: orthancRes.status })
  }

  const imageBuffer = await orthancRes.arrayBuffer()

  return new NextResponse(imageBuffer, {
    headers: {
      'Content-Type': orthancRes.headers.get('Content-Type') || 'image/jpeg',
      'Cache-Control': 'public, max-age=3600', // DICOM images don't change
    },
  })
}
```

---

## DICOM tag reference for QIDO-RS responses

The JSON response from QIDO-RS uses DICOM tag hex codes as keys:

```json
{
  "0020000D": { "Value": ["1.2.840.10008.5.1.4.1.1.2.1234"], "vr": "UI" },
  "00100010": { "Value": [{ "Alphabetic": "Santoso^Budi" }], "vr": "PN" },
  "00100020": { "Value": ["PAT-12345"], "vr": "LO" },
  "00080020": { "Value": ["20250317"], "vr": "DA" },
  "00080061": { "Value": ["CT"], "vr": "CS" }
}
```

### Common tags you'll use in UI

```typescript
// Utility: extract tag value from QIDO-RS study object
function getTagValue(study: any, tag: string): string {
  return study[tag]?.Value?.[0] ?? ''
}

function getPatientName(study: any): string {
  const nameObj = study['00100010']?.Value?.[0]
  return nameObj?.Alphabetic ?? nameObj ?? ''
}

// Usage
const studyUID = getTagValue(study, '0020000D')
const patientID = getTagValue(study, '00100020')
const studyDate = getTagValue(study, '00080020')
const modality = getTagValue(study, '00080061')
const patientName = getPatientName(study)
```

### Critical tags reference

| Tag | Name | Format | Example |
|-----|------|--------|---------|
| `0020000D` | StudyInstanceUID | UID string | `1.2.840...` |
| `0020000E` | SeriesInstanceUID | UID string | `1.2.840...` |
| `00080018` | SOPInstanceUID | UID string | `1.2.840...` |
| `00100010` | PatientName | PersonName object | `{Alphabetic: "Santoso^Budi"}` |
| `00100020` | PatientID | string | `PAT-12345` |
| `00080020` | StudyDate | YYYYMMDD | `20250317` |
| `00080030` | StudyTime | HHMMSS | `093045` |
| `00080060` | Modality | CS string | `CT`, `MR`, `CR` |
| `00080061` | ModalitiesInStudy | CS[] | `["CT"]` |
| `00081030` | StudyDescription | string | `CHEST CT` |

---

## Study worklist component (React)

```typescript
// components/StudyList.tsx
'use client'

import { useEffect, useState } from 'react'

interface Study {
  studyUID: string
  patientName: string
  patientID: string
  studyDate: string
  modality: string
  description: string
}

function parseStudies(raw: any[]): Study[] {
  return raw.map(s => ({
    studyUID: s['0020000D']?.Value?.[0] ?? '',
    patientName: s['00100010']?.Value?.[0]?.Alphabetic ?? '',
    patientID: s['00100020']?.Value?.[0] ?? '',
    studyDate: s['00080020']?.Value?.[0] ?? '',
    modality: s['00080061']?.Value?.[0] ?? s['00080060']?.Value?.[0] ?? '',
    description: s['00081030']?.Value?.[0] ?? '',
  }))
}

export function StudyList() {
  const [studies, setStudies] = useState<Study[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/studies')
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then(data => {
        setStudies(parseStudies(data))
        setLoading(false)
      })
      .catch(err => {
        setError(err.message)
        setLoading(false)
      })
  }, [])

  if (loading) return <div>Loading studies...</div>
  if (error) return <div>Error: {error}</div>
  if (studies.length === 0) return <div>No studies found.</div>

  return (
    <table>
      <thead>
        <tr>
          <th>Patient</th>
          <th>ID</th>
          <th>Date</th>
          <th>Modality</th>
          <th>Description</th>
        </tr>
      </thead>
      <tbody>
        {studies.map(study => (
          <tr key={study.studyUID}>
            <td>{study.patientName}</td>
            <td>{study.patientID}</td>
            <td>{study.studyDate}</td>
            <td>{study.modality}</td>
            <td>{study.description}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
```

---

## Common mistakes Claude Code makes in this file

1. **Using Orthanc REST API format instead of DICOMweb** — `/studies/{orthancId}` is Orthanc's own API. `/dicom-web/studies/{studyUID}` is DICOMweb. They use different IDs. The viewer (Cornerstone3D) expects DICOMweb UIDs.

2. **Exposing Orthanc credentials in client components** — all Orthanc calls must happen in API routes (server-side), never in `'use client'` components.

3. **Not handling the PersonName DICOM format** — `PatientName` is an object `{Alphabetic: "...", Ideographic: "...", Phonetic: "..."}`, not a plain string. Always access `.Alphabetic`.

4. **Forgetting to paginate** — QIDO-RS with no limit returns ALL studies. Add `?limit=50&offset=0`.

5. **Caching DICOM metadata too aggressively** — study metadata can update (e.g., status changes). Cache images (immutable), but be careful with study-level metadata.

---

## Done when
- [ ] `GET /api/studies` returns a populated list from Orthanc
- [ ] `GET /api/studies?PatientName=*` returns filtered results
- [ ] `GET /api/studies/{uid}/series` returns series for a given study
- [ ] WADO proxy returns a viewable JPEG for a known instance
- [ ] StudyList component renders correctly in the browser
- [ ] No Orthanc credentials visible in browser network tab
