# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A hospital/clinic PACS (Picture Archiving and Communication System) for Indonesian hospitals, compliant with PMK 24/2022 regulations.

**Tech stack:**
- **Orthanc** - DICOM server (receives images from CT/MRI/X-ray modalities)
- **PostgreSQL** - Production database index (SQLite for local dev only)
- **Next.js 16** - Radiologist web UI (served at `/app/`)
- **OHIF** - DICOM image viewer (v3.10.2, served at `/viewer/`)
- **nginx** - Reverse proxy with TLS termination
- **Auth service** - Fastify/Node.js JWT authentication service

**Data flow:**
```
[CT/MRI Modality] → C-STORE (port 4242) → [Orthanc] → [PostgreSQL index]
                                                              ↓
                                                      [nginx] ← DICOMweb REST
                                                       ↓    ↓
                                              [OHIF Viewer] [Next.js /app/]
                                                                  ↓
                                                     [auth-service JWT cookies]
```

---

## Development Commands

### Local Development
```bash
# From project root (builds and starts all 6 services)
docker compose up -d --build

# Check services are running
docker compose ps

# View logs
docker compose logs -f orthanc
docker compose logs -f pacs-web

# Stop services
docker compose down
```

### Next.js Web App (local dev outside Docker)
```bash
cd web
cp .env.local.example .env.local  # Fill in values pointing at https://localhost
npm install
npm run dev  # Starts on http://localhost:3000/app/
```

### Testing & Verification
```bash
# Test Orthanc is alive (requires admin credentials)
curl -u admin:$(grep ADMIN_PASSWORD .env | cut -d= -f2) http://localhost:8042/system

# Test DICOMweb is enabled
curl -u admin:$(grep ADMIN_PASSWORD .env | cut -d= -f2) http://localhost:8042/dicom-web/studies

# Upload a DICOM file
curl -u admin:$(grep ADMIN_PASSWORD .env | cut -d= -f2) -X POST http://localhost:8042/instances \
  --data-binary @test.dcm -H "Content-Type: application/dicom"

# List studies
curl -u admin:$(grep ADMIN_PASSWORD .env | cut -d= -f2) http://localhost:8042/studies

# Get rendered PNG preview (replace INSTANCE_ID)
curl -u admin:$(grep ADMIN_PASSWORD .env | cut -d= -f2) \
  http://localhost:8042/instances/{INSTANCE_ID}/preview --output preview.png
```

### PostgreSQL Operations
```bash
# Check connectivity
docker compose exec postgres pg_isready -U orthanc -d orthanc

# Connect to database
docker compose exec postgres psql -U orthanc -d orthanc

# View Orthanc tables
docker compose exec postgres psql -U orthanc -d orthanc -c "\dt"

# Check instance count
docker compose exec postgres psql -U orthanc -d orthanc \
  -c "SELECT COUNT(*) FROM Resources WHERE ResourceType = 3;"
```

---

## Critical Architectural Constraints

### Security Non-Negotiables
1. **Port 8042 must NEVER be exposed to public internet** — no auth on raw port, must go through nginx
2. **PostgreSQL is mandatory for production** — SQLite will break under concurrent modality writes
3. **Server must be physically in Indonesia** — PMK 24/2022 data residency requirement
4. **All external traffic must use TLS** — nginx handles SSL, not Orthanc directly
5. **AE Title must match modality config exactly** — mismatched AE Title is the #1 cause of C-STORE failures
6. **Audit logging must be on before first patient data is stored**

### Configuration Rules
- Use environment variables for secrets and environment-specific values
- Use `orthanc.json` for static structural config only
- Never commit `.env` files or real passwords
- Environment variable format: `ORTHANC__SECTION__KEY=value` (double underscore for nesting)

---

## File Structure

```
PACS/
├── CLAUDE.md                  # This file
├── docker-compose.yml         # Service orchestration
├── .env                       # Secrets (DB_PASSWORD, ADMIN_PASSWORD, JWT_SECRET_KEY)
├── .env.example               # Environment variable template
├── docs/                      # Detailed project documentation
│   ├── 00-overview.md         # Architecture overview
│   ├── 01-local-setup.md      # Local dev setup
│   ├── 02-orthanc-config.md   # Configuration reference
│   ├── 03-postgresql-setup.md # Database setup & backup
│   ├── 04-plugins.md          # Plugin configuration
│   ├── 05-dicomweb-nextjs.md  # Next.js integration
│   ├── 06-viewer.md           # OHIF/Cornerstone3D setup
│   ├── 07-auth-security.md    # Security layers
│   ├── 08-production-deployment.md  # Production deployment
│   ├── 09-pmk-compliance.md   # Indonesian regulatory compliance
│   ├── 10-testing-checklist.md # Pre-go-live verification
│   ├── jwt-authorization-guide.md # JWT auth guide
│   ├── api-documentation.md   # Complete API reference
│   └── postman-collection.json # Postman collection for API testing
├── ohif/                      # OHIF viewer configuration
│   └── app-config.js          # Runtime config (DICOMweb endpoints)
├── auth-service/              # JWT authentication service
│   ├── src/                   # TypeScript source
│   ├── Dockerfile             # Container build
│   ├── package.json           # Dependencies
│   ├── setup.sh               # Setup script
│   ├── test.sh                # Test script
│   └── README.md              # Auth service docs
├── web/                       # Next.js 16 radiologist dashboard
│   ├── Dockerfile             # Multi-stage Node 20 Alpine build
│   ├── next.config.ts         # basePath: '/app', output: 'standalone'
│   ├── proxy.ts               # Auth proxy (Next.js 16 — replaces middleware.ts)
│   ├── app/                   # App Router pages and API routes
│   │   ├── (auth)/login/      # Login page (no sidebar)
│   │   ├── (dashboard)/       # Authenticated pages (sidebar + header)
│   │   │   ├── worklist/      # Study list with search/filter
│   │   │   ├── studies/[uid]/ # Study detail + series list
│   │   │   └── profile/       # User profile
│   │   └── api/               # Server-side API routes (proxy to Orthanc/auth)
│   ├── lib/                   # auth.ts, orthanc.ts, dicom-tags.ts, types.ts
│   ├── components/            # UI components (sidebar, header, tables, etc.)
│   └── hooks/                 # use-auth.tsx, use-studies.ts
└── orthanc/
    ├── orthanc.json           # Orthanc static config (mounted read-only)
    ├── nginx/                 # nginx configuration
    │   ├── nginx.conf         # Reverse proxy config
    │   └── certs/             # TLS certificates
    ├── test.dcm               # Sample DICOM file for testing
    └── preview.png            # Sample rendered image
```

---

## Key Configuration Files

### docker-compose.yml
Located at project root for unified service orchestration. **6 services total:**
- **web** — Next.js 16 app on port 3000 (internal only, accessed via nginx at `/app/`)
- **auth-service** — JWT validation on port 8000 (internal only)
- **orthanc** — DICOM server on ports 4242 (DICOM) and 8042 (REST API, internal only)
- **ohif** — OHIF viewer (internal only, accessed via nginx at `/viewer/`)
- **nginx** — Reverse proxy on ports 80/443 (TLS termination)
- **postgres** — Database on port 5432 (internal only)

### orthanc.json
- `DicomAet`: Application Entity Title — must match modality config
- `DicomPort`: 4242 for DICOM C-STORE from modalities
- `HttpPort`: 8042 for REST API (internal only, never expose publicly)
- `AuthenticationEnabled`: always `true`
- `DicomWeb`: QIDO-RS, WADO-RS, STOW-RS endpoints for Next.js integration

### nginx routing
All external traffic goes through nginx. Key routes:
- `/` → redirect 302 to `/app/`
- `/app/` → Next.js web app (no JWT — app handles auth via httpOnly cookies)
- `/auth/` → auth-service (no JWT required)
- `/orthanc/` → Orthanc REST API (JWT required)
- `/dicom-web/` → Orthanc DICOMweb (JWT required)
- `/wado` → Orthanc WADO-URI (JWT required)
- `/viewer/` → OHIF viewer SPA (no auth — static assets only)
- `/ohif-dicom-web/` → Orthanc DICOMweb (no JWT — basic auth injected by nginx, used by OHIF)
- `/ohif-wado` → Orthanc WADO-URI (no JWT — basic auth injected by nginx, used by OHIF)

### Next.js web app (`web/`)
- **Auth flow:** Browser → `/app/api/auth/login` → auth-service → httpOnly cookies (no raw JWT in browser)
- **DICOMweb flow:** Browser → `/app/api/studies` → Orthanc (Basic auth injected server-side)
- **OHIF link:** `<a href="/viewer/?StudyInstanceUIDs={uid}">` — opens in new tab
- **proxy.ts** (Next.js 16 rename of `middleware.ts`) — redirects unauthenticated users to `/app/login`
- All `cookies()` calls are async: `const store = await cookies()`
- Route params are async: `const { studyUID } = await params`

### .env
Located at project root.
- `DB_PASSWORD`: PostgreSQL password (use strong random value in production)
- `ADMIN_PASSWORD`: Orthanc admin password (use strong random value in production)
- `JWT_SECRET_KEY`: Secret key for JWT token signing (generate with `openssl rand -hex 32`)

---

## Common Issues & Solutions

| Symptom | Cause | Fix |
|---------|-------|-----|
| Port 4242 refused | Container not running | `docker compose up -d` |
| 401 on all requests | Wrong credentials | Check `.env` values match `orthanc.json` |
| 404 on /dicom-web/ | Plugin not enabled | Add `ORTHANC__DICOM_WEB__ENABLE=true` |
| C-STORE from modality fails | AE Title mismatch | Verify `DicomAet` matches modality config |
| Upload returns `AlreadyStored` | Same file uploaded twice | Not an error — Orthanc deduplicates by SOPInstanceUID |
| Images don't load in viewer | Auth or URL misconfigured | Check browser console for 401/404 errors |

---

## Plugin System

The `orthancteam/orthanc` Docker image bundles all major plugins. Enable via environment variables:

**Required plugins:**
- `ORTHANC__POSTGRESQL__ENABLE_INDEX=true` — Production database
- `ORTHANC__DICOM_WEB__ENABLE=true` — DICOMweb REST API
- `ORTHANC__ORTHANC_EXPLORER_2__ENABLE=true` — Modern web UI

**Optional plugins:**
- `ORTHANC__AUTHORIZATION__ENABLE=true` — JWT-based auth (production)
- `ORTHANC__DELAYED_DELETION__ENABLE=true` — Async file deletion

Check loaded plugins:
```bash
curl -u admin:$(grep ADMIN_PASSWORD .env | cut -d= -f2) http://localhost:8042/plugins
```

---

## DICOMweb Integration

When building Next.js integration:

1. **All Orthanc calls must happen in API routes** — never expose credentials to browser
2. **Use DICOMweb endpoints, not Orthanc REST API** — viewers expect DICOMweb format
3. **Proxy through Next.js** — `/api/dicom-web/*` → `http://orthanc:8042/dicom-web/*`
4. **Handle DICOM tag format** — QIDO-RS returns hex tag keys (e.g., `00100010` for PatientName)
5. **PatientName is an object** — access `.Alphabetic` property, not string value

Critical DICOMweb endpoints:
- QIDO-RS: `/dicom-web/studies` — Study list query
- WADO-RS: `/dicom-web/studies/{uid}/series/{uid}/instances/{uid}` — Retrieve instances
- WADO-URI: `/wado?requestType=WADO&...` — Single-image rendered JPEG/PNG

---

## Pre-Deployment Checklist

Before connecting real modalities or patient data:

1. **Infrastructure**: All containers healthy, PostgreSQL connected
2. **DICOM protocol**: C-ECHO and C-STORE test successful
3. **DICOMweb**: QIDO-RS and WADO-RS return valid data
4. **Security**: Port 8042 blocked externally, HTTPS working
5. **Auth**: Unauthenticated requests rejected, audit logging enabled
6. **Backup**: PostgreSQL backup script tested, restore procedure verified
7. **Compliance**: Server in Indonesia, audit trail requirements met
8. **Load test**: Concurrent C-STORE with 50+ files succeeds

See `docs/10-testing-checklist.md` for complete verification procedures.

---

## What NOT to Do

1. **Never set `AuthenticationEnabled: false`** — completely insecure
2. **Never expose port 8042 publicly** — bypasses all security layers
3. **Never use SQLite in production** — will corrupt under concurrent writes
4. **Never hardcode passwords** — use environment variables
5. **Never change `DicomAet` after modalities are configured** — breaks all C-STORE connections
6. **Never skip backup testing** — untested backups are no backups
7. **Never deploy without completing testing checklist** — real patient data safety depends on it
