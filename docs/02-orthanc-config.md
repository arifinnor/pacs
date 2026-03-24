# 02 — Orthanc Configuration Reference

## How Orthanc reads config

Orthanc (`orthancteam/orthanc` image) reads configuration from two sources, merged in this order:
1. `/etc/orthanc/orthanc.json` (file, mounted via volume)
2. Environment variables prefixed `ORTHANC__` (override the JSON)

Environment variable format: `ORTHANC__SECTION__KEY=value`
- Double underscore `__` separates nesting levels
- Top-level keys: `ORTHANC__KEY=value`
- Plugin section keys: `ORTHANC__POSTGRESQL__HOST=postgres`

**Rule**: Prefer environment variables for secrets and environment-specific values. Use `orthanc.json` for static structural config.

---

## Core identity settings

```json
{
  "Name": "HospitalPACS",
  "DicomAet": "HOSPITAL_PACS",
  "DicomPort": 4242,
  "HttpPort": 8042
}
```

### `DicomAet` — Application Entity Title
- This is the DICOM identity of your PACS server
- **Must match exactly** what is configured in each modality (CT/MRI scanner)
- Max 16 characters, uppercase, no spaces (use underscores)
- If a CT scanner is configured to send to AE `MYPACS` but your Orthanc has `DicomAet: ORTHANC`, the C-STORE will be **refused**
- Choose this carefully — changing it later requires reconfiguring every modality

---

## Registering modalities (CT/MRI/X-ray machines)

```json
{
  "DicomModalities": {
    "CT_ROOM_1": {
      "AET": "CT1_AET",
      "Host": "192.168.1.101",
      "Port": 104,
      "Manufacturer": "GenericNoWildcardInDicomQuery"
    },
    "MRI_ROOM_1": {
      "AET": "MRI1_AET",
      "Host": "192.168.1.102",
      "Port": 104
    }
  }
}
```

### Fields explanation
- `"CT_ROOM_1"` — symbolic name (appears in Orthanc UI, used in Lua/Python routing)
- `AET` — the AE Title of the **modality** (get this from the scanner's network config)
- `Host` — IP address of the modality on the hospital network
- `Port` — DICOM port of the modality (usually 104 for production equipment)
- `Manufacturer` — optional, handles vendor-specific C-FIND quirks

### What you need from the hospital IT / biomedical engineer
For each modality, get:
1. The modality's AE Title
2. The modality's IP address
3. The modality's DICOM port
4. Configure the modality with: your Orthanc AE Title (`DicomAet`), Orthanc IP, Orthanc port (4242)

---

## Storage settings

```json
{
  "StorageDirectory": "/var/lib/orthanc/db",
  "IndexDirectory": "/var/lib/orthanc/db",
  "StorageCompression": false,
  "MaximumStorageSize": 0,
  "MaximumPatientCount": 0
}
```

- `StorageDirectory` — where raw `.dcm` files are stored on disk
- `IndexDirectory` — where the SQLite database lives (overridden when using PostgreSQL plugin)
- `StorageCompression` — gzip compression on stored files. Set `true` to save ~30% storage. CPU cost is minimal on modern hardware. Set `false` if your storage is SSD and retrieval speed is priority.
- `MaximumStorageSize` — 0 means unlimited. Set in MB if you need to enforce a cap.
- `MaximumPatientCount` — 0 means unlimited.

> **In production**: `StorageDirectory` must point to a persistent volume. If you're using the PostgreSQL plugin, DICOM files still go to `StorageDirectory` — only the index (metadata/tags) goes to PostgreSQL.

---

## Network access

```json
{
  "RemoteAccessAllowed": true,
  "SslEnabled": false,
  "AuthenticationEnabled": true,
  "RegisteredUsers": {
    "admin": "change_this_password"
  }
}
```

- `RemoteAccessAllowed: true` — required; without it only localhost can access the REST API
- `SslEnabled: false` — TLS is handled by nginx, not Orthanc directly
- `AuthenticationEnabled: true` — **always true**; false means any network request is authenticated
- `RegisteredUsers` — basic HTTP auth; this is overridden by the authorization plugin in production

---

## DICOMweb plugin config

```json
{
  "DicomWeb": {
    "Enable": true,
    "Root": "/dicom-web/",
    "EnableWado": true,
    "WadoRoot": "/wado",
    "Ssl": false,
    "QidoCaseSensitive": false,
    "Host": "localhost",
    "StudiesMetadata": "MainDicomTags",
    "SeriesMetadata": "MainDicomTags"
  }
}
```

Via environment variables:
```
ORTHANC__DICOM_WEB__ENABLE=true
ORTHANC__DICOM_WEB__ROOT=/dicom-web/
ORTHANC__DICOM_WEB__ENABLE_WADO=true
ORTHANC__DICOM_WEB__WADO_ROOT=/wado
ORTHANC__DICOM_WEB__QIDO_CASE_SENSITIVE=false
```

- `Root` — base path for QIDO-RS, STOW-RS, WADO-RS endpoints
- `WadoRoot` — WADO-URI endpoint (older standard, still used by some viewers)
- `QidoCaseSensitive: false` — allows case-insensitive patient name searches

---

## Orthanc Explorer 2 (OE2) plugin config

```json
{
  "OrthancExplorer2": {
    "Enable": true,
    "IsDefaultOrthancUI": true,
    "UiOptions": {
      "EnableUpload": true,
      "EnableDeleteResources": false,
      "EnableAnonymize": false
    }
  }
}
```

Via environment variables:
```
ORTHANC__ORTHANC_EXPLORER_2__ENABLE=true
ORTHANC__ORTHANC_EXPLORER_2__IS_DEFAULT_ORTHANC_UI=true
```

- `IsDefaultOrthancUI: true` — replaces the legacy Orthanc Explorer with OE2 at `/ui/app/`
- `EnableDeleteResources: false` — prevent accidental deletion in production

---

## Logging

```json
{
  "Verbose": false,
  "Trace": false,
  "LogExportedResources": true
}
```

- `Verbose: false` — set to `true` temporarily when debugging C-STORE failures
- `Trace: false` — very detailed, only for deep debugging, generates huge logs
- `LogExportedResources: true` — log every C-MOVE/WADO retrieval; needed for PMK audit trail

For production log shipping, mount a log directory and configure `logrotate`. Do not set Verbose/Trace permanently in production.

---

## What Claude Code must NOT do in this file

1. Do not set `AuthenticationEnabled: false` — ever
2. Do not set `RemoteAccessAllowed: false` — Orthanc can't receive remote DICOM stores
3. Do not hardcode passwords in `orthanc.json` that gets committed to git — use environment variables
4. Do not set `SslEnabled: true` in Orthanc directly — SSL is handled by nginx
5. Do not remove `DicomAet` — without it Orthanc uses a default that won't match modality config
6. Do not change `DicomAet` after modalities are already configured — breaks all C-STORE connections

---

## Environment variable reference card

```bash
# Identity
ORTHANC__NAME=HospitalPACS
ORTHANC__DICOM_AET=HOSPITAL_PACS

# Access
ORTHANC__REMOTE_ACCESS_ALLOWED=true
ORTHANC__AUTHENTICATION_ENABLED=true
ORTHANC__REGISTERED_USERS={"admin":"${ADMIN_PASSWORD}"}

# DICOMweb
ORTHANC__DICOM_WEB__ENABLE=true
ORTHANC__DICOM_WEB__ROOT=/dicom-web/

# OE2
ORTHANC__ORTHANC_EXPLORER_2__ENABLE=true
ORTHANC__ORTHANC_EXPLORER_2__IS_DEFAULT_ORTHANC_UI=true

# PostgreSQL (see 03-postgresql-setup.md)
ORTHANC__POSTGRESQL__HOST=postgres
ORTHANC__POSTGRESQL__PORT=5432
ORTHANC__POSTGRESQL__DATABASE=orthanc
ORTHANC__POSTGRESQL__USERNAME=orthanc
ORTHANC__POSTGRESQL__PASSWORD=${DB_PASSWORD}
ORTHANC__POSTGRESQL__ENABLE_INDEX=true
ORTHANC__POSTGRESQL__ENABLE_STORAGE=false
```
