# Orthanc PACS — Project Overview

## What you're building

A hospital/clinic PACS (Picture Archiving and Communication System) with:
- **Orthanc** as the DICOM server (receives images from CT/MRI/X-ray machines)
- **PostgreSQL** as the production database index
- **Next.js** as the frontend for radiologists and clinicians
- **Cornerstone3D or OHIF** as the DICOM image viewer
- Deployed in **Indonesia** (PMK 24/2022 compliance required)

---

## Document map

| File | What it covers |
|------|----------------|
| `01-local-setup.md` | Docker Compose, first Orthanc run, verify it works |
| `02-orthanc-config.md` | orthanc.json / env vars deep reference |
| `03-postgresql-setup.md` | Switch from SQLite to PostgreSQL, backup strategy |
| `04-plugins.md` | Which plugins to enable and why |
| `05-dicomweb-nextjs.md` | Connecting Next.js to Orthanc via DICOMweb |
| `06-viewer.md` | OHIF or Cornerstone3D integration |
| `07-auth-security.md` | TLS, authentication, audit logging |
| `08-production-deployment.md` | Docker production stack, nginx, health checks |
| `09-pmk-compliance.md` | PMK 24/2022 checklist, data residency, audit trails |
| `10-testing-checklist.md` | End-to-end verification before go-live |

---

## Architecture overview

```
[CT / MRI / X-ray Modality]
        |
        | C-STORE (DICOM, port 4242)
        v
[Orthanc Server]  <-- orthanc-authorization plugin enforces access
        |
        |-- PostgreSQL (index: patients, studies, series, instances)
        |-- /storage volume (raw .dcm files)
        |
        | DICOMweb REST (QIDO-RS / WADO-RS / STOW-RS)
        v
[nginx reverse proxy]  <-- TLS termination, port 443
        |
        v
[Next.js App]  <-- radiologist UI, study worklist
        |
        v
[Cornerstone3D / OHIF Viewer]  <-- renders DICOM in browser
```

---

## Port reference

| Port | Protocol | Purpose |
|------|----------|---------|
| 4242 | DICOM | Receives C-STORE from modalities |
| 8042 | HTTP | REST API + Orthanc Explorer (internal only) |
| 443 | HTTPS | nginx proxy (public-facing) |
| 5432 | TCP | PostgreSQL (internal network only) |

---

## Key constraints to never forget

1. **Orthanc port 8042 must NEVER be exposed to public internet** — no auth on raw port
2. **All traffic through nginx** — TLS required for clinical use
3. **PostgreSQL is mandatory** — SQLite will break under concurrent modality writes
4. **Server must be physically in Indonesia** — PMK 24/2022 data residency
5. **Audit logging must be on before first patient data is stored**
6. **AE Title must match exactly** — mismatched AE Title is the #1 cause of C-STORE failures

---

## Definition of "done" per phase

### Phase 1 — Local dev
- [ ] Orthanc runs in Docker, accessible at localhost:8042
- [ ] Can upload a DICOM file via Orthanc Explorer
- [ ] Can query it via `curl` QIDO-RS
- [ ] Can retrieve a rendered PNG via WADO-URI

### Phase 2 — Production config
- [ ] PostgreSQL replaces SQLite
- [ ] DICOMweb plugin enabled
- [ ] OE2 (Orthanc Explorer 2) enabled
- [ ] Authorization plugin enabled with JWT
- [ ] Basic nginx + TLS working

### Phase 3 — Next.js integration
- [ ] Study list loads from QIDO-RS
- [ ] Series and instance metadata loads
- [ ] Images render in Cornerstone3D or OHIF
- [ ] Auth token passed correctly from Next.js → Orthanc

### Phase 4 — Production hardening
- [ ] HA setup: 2 Orthanc instances on shared PostgreSQL + shared storage
- [ ] Automated PostgreSQL backup
- [ ] Log shipping configured
- [ ] PMK compliance checklist signed off
- [ ] Load test: modality sending 100 instances simultaneously
