# 01 — Local Setup

## Goal
Orthanc running locally in Docker. You can upload a DICOM file, query it via REST, and retrieve a rendered image. Nothing else.

---

## What to build

### File structure
```
pacs/
├── docker-compose.yml
├── orthanc/
│   └── orthanc.json
└── test/
    └── (DICOM test files go here)
```

---

## docker-compose.yml

```yaml
version: "3.8"

services:
  orthanc:
    image: orthancteam/orthanc:latest
    container_name: orthanc-dev
    ports:
      - "4242:4242"   # DICOM protocol
      - "8042:8042"   # REST API + Web UI
    volumes:
      - ./orthanc/orthanc.json:/etc/orthanc/orthanc.json:ro
      - orthanc-storage:/var/lib/orthanc/db
    environment:
      - ORTHANC__DICOM_AET=ORTHANC
      - ORTHANC__DICOM_PORT=4242
      - ORTHANC__HTTP_PORT=8042
      - ORTHANC__REMOTE_ACCESS_ALLOWED=true
      - ORTHANC__AUTHENTICATION_ENABLED=true
      - ORTHANC__REGISTERED_USERS={"admin":"admin"}
    restart: unless-stopped

volumes:
  orthanc-storage:
```

> **IMPORTANT for Claude Code**: Do NOT use `ORTHANC__REGISTERED_USERS` as a plain string in production. In dev it's fine. In production, use the authorization plugin with JWT tokens (see `07-auth-security.md`).

---

## orthanc/orthanc.json

```json
{
  "Name": "OrthancDev",
  "StorageDirectory": "/var/lib/orthanc/db",
  "IndexDirectory": "/var/lib/orthanc/db",
  "StorageCompression": false,
  "MaximumStorageSize": 0,
  "MaximumPatientCount": 0,

  "DicomAet": "ORTHANC",
  "DicomPort": 4242,
  "HttpPort": 8042,

  "RemoteAccessAllowed": true,
  "SslEnabled": false,

  "AuthenticationEnabled": true,
  "RegisteredUsers": {
    "admin": "admin"
  },

  "DicomModalities": {},
  "OrthancPeers": {},

  "HttpCompressionEnabled": true,
  "KeepAlive": true,

  "LogExportedResources": false,
  "Plugins": []
}
```

> **Note for Claude Code**: `Plugins` array is empty here because the local dev image uses environment variables to enable bundled plugins. This changes in production (see `04-plugins.md`).

---

## Verification steps — run these after `docker compose up`

### 1. Check Orthanc is alive
```bash
curl -u admin:admin http://localhost:8042/system
```
Expected: JSON with `"Name": "OrthancDev"`, `"Version": "..."`, `"DatabaseVersion": ...`

If you get `Connection refused`: container isn't up. Check `docker compose logs orthanc`.
If you get `401 Unauthorized`: auth is working but credentials are wrong.

### 2. Open Orthanc Explorer
```
http://localhost:8042/ui/app/
```
Login: admin / admin
You should see an empty patient list.

### 3. Upload a test DICOM file
Download free test DICOM files from: https://www.osirix-viewer.com/resources/dicom-image-library/

Via Orthanc Explorer: drag-and-drop a .dcm file onto the upload area.

Via curl:
```bash
curl -u admin:admin -X POST http://localhost:8042/instances \
  --data-binary @path/to/your/file.dcm \
  -H "Content-Type: application/dicom"
```
Expected: `{"ID":"...","ParentSeries":"...","ParentStudy":"...","Status":"Success"}`

### 4. Verify the hierarchy
```bash
# List patients
curl -u admin:admin http://localhost:8042/patients

# List studies
curl -u admin:admin http://localhost:8042/studies

# Drill into a study (replace ID with actual value from above)
curl -u admin:admin http://localhost:8042/studies/{studyId}
```

### 5. Query via DICOMweb (QIDO-RS)
```bash
# This will fail if the DICOMweb plugin is not enabled
# It IS bundled in orthancteam/orthanc — enable it via env var
curl -u admin:admin http://localhost:8042/dicom-web/studies
```
Expected: JSON array of studies.
If you get 404: DICOMweb plugin not enabled. Add to docker-compose:
```yaml
environment:
  - ORTHANC__DICOM_WEB__ENABLE=true
```

### 6. Retrieve a rendered image
```bash
# Get instanceId from step 4
curl -u admin:admin \
  "http://localhost:8042/instances/{instanceId}/preview" \
  --output preview.png

open preview.png  # macOS
# or
xdg-open preview.png  # Linux
```
Expected: A PNG of the DICOM slice.

---

## Common failure modes

| Symptom | Cause | Fix |
|---------|-------|-----|
| Port 4242 refused | Container not running | `docker compose up -d` |
| 401 on all requests | Wrong credentials | Check `RegisteredUsers` in orthanc.json |
| 404 on /dicom-web/ | Plugin not enabled | Add `ORTHANC__DICOM_WEB__ENABLE=true` env var |
| Upload returns `{"Status":"AlreadyStored"}` | Same file uploaded twice | Not an error — Orthanc deduplicates by SOPInstanceUID |
| Upload returns `{"Status":"FilteredOut"}` | Lua/Python filter rejected it | No filter in dev — check logs |
| C-STORE from modality fails | AE Title mismatch | See `02-orthanc-config.md` — AE Title must match exactly |

---

## Do NOT do in this phase
- Do not expose port 8042 to the internet
- Do not use `admin:admin` credentials in any environment that touches real patient data
- Do not rely on the SQLite database for anything beyond local testing
- Do not skip the verification steps — confirm each one works before moving to Phase 2

---

## Done when
- [ ] `curl localhost:8042/system` returns valid JSON
- [ ] A DICOM file uploads successfully
- [ ] `curl localhost:8042/studies` returns the uploaded study
- [ ] `curl localhost:8042/dicom-web/studies` returns the same study (DICOMweb working)
- [ ] `/instances/{id}/preview` returns a viewable PNG image
