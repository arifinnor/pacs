# 10 — Testing Checklist (Pre Go-Live)

Run every item on this list before allowing real patient data into the system. If any item fails, do not proceed.

---

## Tools you need

```bash
# DCMTK — DICOM command line tools
# Ubuntu/Debian:
apt install dcmtk

# macOS:
brew install dcmtk

# Verify:
storescu --version
findscu --version
echoscu --version
```

Free test DICOM files: https://www.osirix-viewer.com/resources/dicom-image-library/

---

## Phase 1: Infrastructure

### 1.1 All services running
```bash
docker compose ps
# Expected: orthanc, postgres, nginx, ohif, nextjs all "Up (healthy)"
```

### 1.2 Orthanc system endpoint
```bash
curl -u admin:${ADMIN_PASSWORD} http://localhost:8042/system
# Expected: JSON with Name, Version, DatabaseVersion
```

### 1.3 PostgreSQL connectivity
```bash
docker compose exec postgres pg_isready -U orthanc -d orthanc
# Expected: "orthanc:5432 - accepting connections"
```

### 1.4 DICOMweb enabled
```bash
curl -u admin:${ADMIN_PASSWORD} http://localhost:8042/dicom-web/studies
# Expected: empty JSON array [] (not 404)
```

### 1.5 HTTPS working
```bash
curl -I https://your-domain.com
# Expected: HTTP/2 200 with Strict-Transport-Security header

curl -I http://your-domain.com
# Expected: 301 redirect to HTTPS
```

### 1.6 Port 8042 blocked externally
```bash
# Run this from a machine OUTSIDE your network
curl --connect-timeout 5 http://your-server-ip:8042/system
# Expected: connection refused or timeout — NOT a response
```

---

## Phase 2: DICOM protocol (C-STORE from modality)

### 2.1 DICOM ping (C-ECHO)
```bash
echoscu -aet TESTCLIENT -aec HOSPITAL_PACS your-server-ip 4242
# Expected: 0 - Success
# If fails: check AE Title matches ORTHANC__DICOM_AET, check port 4242 open
```

### 2.2 Send a DICOM file (C-STORE)
```bash
storescu -aet TESTCLIENT -aec HOSPITAL_PACS your-server-ip 4242 test.dcm
# Expected: "Informational: Received Store Response (Success)"
```

### 2.3 Verify file arrived in Orthanc
```bash
curl -u admin:${ADMIN_PASSWORD} http://localhost:8042/instances
# Expected: array with one entry
```

### 2.4 Verify file indexed in PostgreSQL
```bash
docker compose exec postgres psql -U orthanc -d orthanc \
  -c "SELECT COUNT(*) FROM Resources WHERE ResourceType = 3;"
# ResourceType 3 = instances
# Expected: count > 0
```

---

## Phase 3: DICOMweb API

### 3.1 QIDO-RS study list
```bash
curl -u admin:${ADMIN_PASSWORD} \
  "http://localhost:8042/dicom-web/studies" | python3 -m json.tool | head -30
# Expected: JSON array with tag objects (keys like "0020000D", "00100010")
```

### 3.2 QIDO-RS with filter
```bash
# Replace with actual patient name from your test file
curl -u admin:${ADMIN_PASSWORD} \
  "http://localhost:8042/dicom-web/studies?PatientName=*" | python3 -m json.tool
# Expected: filtered results (or all if * matches all)
```

### 3.3 WADO-RS instance metadata
```bash
# Get studyUID and seriesUID from QIDO-RS response above
STUDY_UID="1.2.840.xxxxx"
SERIES_UID="1.2.840.xxxxx"

curl -u admin:${ADMIN_PASSWORD} \
  "http://localhost:8042/dicom-web/studies/${STUDY_UID}/series/${SERIES_UID}/instances" \
  | python3 -m json.tool | head -20
# Expected: JSON array of instances
```

### 3.4 WADO-URI rendered image
```bash
# Get instance UID from above
INSTANCE_UID="1.2.840.xxxxx"

curl -u admin:${ADMIN_PASSWORD} \
  "http://localhost:8042/wado?requestType=WADO&studyUID=${STUDY_UID}&seriesUID=${SERIES_UID}&objectUID=${INSTANCE_UID}&contentType=image/jpeg" \
  --output test-render.jpg

# Open the file — should be a viewable medical image
file test-render.jpg
# Expected: "JPEG image data"
```

---

## Phase 4: Next.js integration

### 4.1 Study list API
```bash
curl http://localhost:3000/api/studies
# Expected: JSON array of studies (same data as DICOMweb but proxied)
```

### 4.2 No credentials in browser response
```bash
curl -v http://localhost:3000/api/studies 2>&1 | grep -i authorization
# Expected: NO Authorization header visible in response
# (It should only be in the server-to-Orthanc request, not returned to client)
```

### 4.3 UI renders study list
- Open http://localhost:3000 in browser
- Study list should be populated
- Patient names, dates, modalities should display correctly

### 4.4 OHIF viewer loads a study
- Click a study in the Next.js worklist
- OHIF should open and load the images
- Images should render (not blank, not error)
- Check browser console: no 401 or 404 errors

---

## Phase 5: Auth & security

### 5.1 Unauthenticated request rejected
```bash
curl http://localhost:8042/studies
# Expected: 401 Unauthorized (NOT the study list)
```

### 5.2 Wrong credentials rejected
```bash
curl -u admin:wrongpassword http://localhost:8042/studies
# Expected: 401 Unauthorized
```

### 5.3 Audit log is writing
```bash
# View a study in the browser
# Then check audit log:
tail -20 /var/log/pacs/audit.log
# OR
docker compose exec postgres psql -U orthanc -d orthanc \
  -c "SELECT * FROM audit_log ORDER BY timestamp DESC LIMIT 10;"
# Expected: entries for your recent actions
```

---

## Phase 6: Backup & recovery

### 6.1 Backup runs without error
```bash
bash /opt/pacs/scripts/backup-postgres.sh
# Expected: completes without error, .dump file created
```

### 6.2 Restore tested
```bash
# On a SEPARATE test machine or isolated environment:
# Restore the dump
# Start Orthanc pointing at restored DB
# Verify studies are accessible
# If this works, your backup is valid
```

---

## Phase 7: Load test (before connecting real modalities)

### 7.1 Concurrent C-STORE
```bash
# Send 50 DICOM files simultaneously
for i in {1..50}; do
  storescu -aet LOADTEST -aec HOSPITAL_PACS localhost 4242 test.dcm &
done
wait

# Check all arrived
curl -u admin:${ADMIN_PASSWORD} http://localhost:8042/statistics
# Expected: CountInstances shows expected number (deduplication will show 1 if same file used)
# Better: use 50 different DICOM files

# Check for errors in logs
docker compose logs orthanc | grep -i error | tail -20
```

### 7.2 Check PostgreSQL connection pool
```bash
docker compose exec postgres psql -U orthanc -d orthanc \
  -c "SELECT count(*) FROM pg_stat_activity WHERE datname='orthanc';"
# Expected: < INDEX_CONNECTIONS_COUNT (15)
# If at max: increase ORTHANC__POSTGRESQL__INDEX_CONNECTIONS_COUNT
```

---

## Sign-off

Before go-live, confirm each category:

| Category | Verified by | Date |
|----------|-------------|------|
| Infrastructure | | |
| DICOM C-STORE | | |
| DICOMweb API | | |
| Next.js integration | | |
| Auth & security | | |
| Backup & recovery | | |
| PMK compliance (see `09-pmk-compliance.md`) | | |

**Do not connect real modalities or allow real patient data until all items are verified.**
