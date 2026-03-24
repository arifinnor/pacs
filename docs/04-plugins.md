# 04 — Plugins

## How plugins work in orthancteam/orthanc

The `orthancteam/orthanc` Docker image bundles all major plugins pre-compiled. You enable them via environment variables — no separate installation needed.

If you see instructions telling you to copy `.so` files into containers, that's for bare-metal or custom Docker builds. With `orthancteam/orthanc`, use env vars.

---

## Plugins to enable for this PACS

| Plugin | Required? | Purpose |
|--------|-----------|---------|
| `postgresql` | Yes | Production database index |
| `dicom-web` | Yes | DICOMweb (QIDO-RS/WADO-RS) for Next.js |
| `orthanc-explorer-2` | Yes | Modern radiologist web UI |
| `authorization` | Yes | JWT-based auth (production) |
| `python` | Optional | Custom routing logic |
| `delayed-deletion` | Recommended | Async file deletion (prevents API blocking) |
| `connectivity-checks` | Dev/ops | Verify modality connectivity |

---

## Complete docker-compose.yml with all plugins

```yaml
version: "3.8"

services:
  orthanc:
    image: orthancteam/orthanc:latest
    container_name: orthanc
    ports:
      - "4242:4242"
      - "8042:8042"
    volumes:
      - orthanc-storage:/var/lib/orthanc/storage
      - ./orthanc/orthanc.json:/etc/orthanc/orthanc.json:ro
    environment:
      # --- Identity ---
      - ORTHANC__NAME=HospitalPACS
      - ORTHANC__DICOM_AET=HOSPITAL_PACS
      - ORTHANC__REMOTE_ACCESS_ALLOWED=true
      - ORTHANC__AUTHENTICATION_ENABLED=true
      - ORTHANC__REGISTERED_USERS={"admin":"${ADMIN_PASSWORD}"}

      # --- PostgreSQL ---
      - ORTHANC__POSTGRESQL__HOST=postgres
      - ORTHANC__POSTGRESQL__PORT=5432
      - ORTHANC__POSTGRESQL__DATABASE=orthanc
      - ORTHANC__POSTGRESQL__USERNAME=orthanc
      - ORTHANC__POSTGRESQL__PASSWORD=${DB_PASSWORD}
      - ORTHANC__POSTGRESQL__ENABLE_INDEX=true
      - ORTHANC__POSTGRESQL__ENABLE_STORAGE=false
      - ORTHANC__POSTGRESQL__INDEX_CONNECTIONS_COUNT=10

      # --- DICOMweb ---
      - ORTHANC__DICOM_WEB__ENABLE=true
      - ORTHANC__DICOM_WEB__ROOT=/dicom-web/
      - ORTHANC__DICOM_WEB__ENABLE_WADO=true
      - ORTHANC__DICOM_WEB__WADO_ROOT=/wado
      - ORTHANC__DICOM_WEB__QIDO_CASE_SENSITIVE=false

      # --- Orthanc Explorer 2 ---
      - ORTHANC__ORTHANC_EXPLORER_2__ENABLE=true
      - ORTHANC__ORTHANC_EXPLORER_2__IS_DEFAULT_ORTHANC_UI=true

      # --- Authorization (see 07-auth-security.md for full config) ---
      - ORTHANC__AUTHORIZATION__ENABLE=true
      - ORTHANC__AUTHORIZATION__WEB_SERVICE_ROOT_URL=http://auth-service:8000/

      # --- Delayed deletion ---
      - ORTHANC__DELAYED_DELETION__ENABLE=true
      - ORTHANC__DELAYED_DELETION__THROTTLE_DELAY=100

    depends_on:
      postgres:
        condition: service_healthy
    restart: unless-stopped

  postgres:
    image: postgres:15
    container_name: orthanc-postgres
    environment:
      - POSTGRES_DB=orthanc
      - POSTGRES_USER=orthanc
      - POSTGRES_PASSWORD=${DB_PASSWORD}
    volumes:
      - postgres-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U orthanc -d orthanc"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped

volumes:
  orthanc-storage:
  postgres-data:
```

---

## Plugin-specific notes

### DICOMweb plugin

This is the API layer your Next.js app uses. Critical settings:

- `Root: /dicom-web/` — trailing slash is required. Without it, some WADO-RS clients fail.
- `QidoCaseSensitive: false` — allows `PatientName=SANTOSO*` to match `Santoso^Budi`
- `EnableWado: true` — enables WADO-URI (single-image retrieval, used by some older viewers)

Test after enabling:
```bash
# Should return JSON array of studies
curl -u admin:pass http://localhost:8042/dicom-web/studies

# Should return rendered JPEG
curl -u admin:pass \
  "http://localhost:8042/dicom-web/studies/{uid}/series/{uid}/instances/{uid}/rendered" \
  --output test.jpg
```

### Orthanc Explorer 2 (OE2)

Replaces the legacy Orthanc Explorer. Radiologists may use this directly for basic operations.

`IsDefaultOrthancUI: true` — navigating to `http://server:8042/ui/app/` shows OE2 instead of legacy UI.

```json
"OrthancExplorer2": {
  "Enable": true,
  "IsDefaultOrthancUI": true,
  "UiOptions": {
    "EnableUpload": true,
    "EnableDeleteResources": false,
    "EnableAnonymize": true,
    "StudyListColumns": ["PatientName", "PatientID", "StudyDate", "Modality", "StudyDescription"],
    "DefaultLanguage": "en"
  }
}
```

### Authorization plugin

Do not configure this until you have an auth service to back it. The plugin expects to call an external HTTP endpoint to validate tokens.

See `07-auth-security.md` for the full flow.

**In development**: disable the authorization plugin and use basic auth only.
**Before production**: enable authorization plugin with a real JWT validation endpoint.

If you enable the auth plugin with no backing service, all requests will fail.

### Python plugin

Use for custom routing logic — e.g., routing CT images to one storage node and MRI to another.

Example: auto-route incoming images by modality:
```python
# /etc/orthanc/python/route.py

def OnStoredInstance(dicom, instanceId):
    modality = dicom.GetMainDicomTag("Modality", "")
    if modality == "CT":
        orthanc.RestApiPost("/peers/ct-archive/store", instanceId)
    elif modality == "MR":
        orthanc.RestApiPost("/peers/mri-archive/store", instanceId)
```

Mount the script:
```yaml
volumes:
  - ./orthanc/python/route.py:/etc/orthanc/python/route.py:ro
environment:
  - ORTHANC__PYTHON_SCRIPT=/etc/orthanc/python/route.py
```

---

## Verify all plugins are loaded

```bash
curl -u admin:pass http://localhost:8042/plugins | python3 -m json.tool
```

Expected output includes:
```json
[
  "dicom-web",
  "orthanc-explorer-2",
  "postgresql-index",
  "orthanc-authorization",
  ...
]
```

If a plugin is missing, check:
1. The environment variable name — double-check spelling and double-underscore format
2. `docker compose logs orthanc | grep -i "plugin"` — shows what was loaded and any errors

---

## Done when
- [ ] `/plugins` endpoint lists dicom-web, orthanc-explorer-2, postgresql-index
- [ ] `/dicom-web/studies` returns valid JSON
- [ ] OE2 accessible at `/ui/app/`
- [ ] PostgreSQL plugin confirmed via `docker compose logs orthanc | grep postgresql`
