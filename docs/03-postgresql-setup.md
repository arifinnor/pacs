# 03 — PostgreSQL Setup & Backup

## Why PostgreSQL is mandatory

SQLite is Orthanc's default. It is **not acceptable for production** because:
- SQLite serializes all writes — one CT scanner sending 300 slices will block any other write
- No concurrent read/write safety under load
- Backup requires stopping Orthanc or using SQLite-specific tools
- Cannot be used for multi-instance HA Orthanc

Switch to PostgreSQL before any patient data is stored. Migrating later is painful.

---

## What PostgreSQL stores vs what stays on disk

| Data | Location |
|------|----------|
| DICOM metadata (tags, UIDs, patient names, study dates) | PostgreSQL |
| File index (which file = which instance) | PostgreSQL |
| Raw `.dcm` files | Filesystem (StorageDirectory volume) |
| Pixel data | Filesystem |

PostgreSQL is the **index**. The actual image files remain on disk/NFS/S3.

---

## Docker Compose with PostgreSQL

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
      - ORTHANC__POSTGRESQL__HOST=postgres
      - ORTHANC__POSTGRESQL__PORT=5432
      - ORTHANC__POSTGRESQL__DATABASE=orthanc
      - ORTHANC__POSTGRESQL__USERNAME=orthanc
      - ORTHANC__POSTGRESQL__PASSWORD=${DB_PASSWORD}
      - ORTHANC__POSTGRESQL__ENABLE_INDEX=true
      - ORTHANC__POSTGRESQL__ENABLE_STORAGE=false
      - ORTHANC__POSTGRESQL__INDEX_CONNECTIONS_COUNT=10
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
    # NEVER expose port 5432 to the host network in production
    # ports:
    #   - "5432:5432"  # dev only

volumes:
  orthanc-storage:
  postgres-data:
```

### .env file (create this, never commit to git)
```
DB_PASSWORD=change_this_to_a_strong_random_password
ADMIN_PASSWORD=change_this_too
```

---

## Key PostgreSQL env var explanation

| Variable | Value | What it does |
|----------|-------|-------------|
| `ENABLE_INDEX=true` | boolean | Uses PostgreSQL for the DICOM metadata index |
| `ENABLE_STORAGE=false` | boolean | Keep `false` — store files on filesystem, not in PG |
| `INDEX_CONNECTIONS_COUNT=10` | integer | Connection pool size — increase for high modality count |

> **ENABLE_STORAGE=true** stores DICOM binary files as PostgreSQL BLOBs. Do not use this — it bloats the database, makes backups huge, and slows retrieval. Keep files on disk.

---

## Verification

```bash
# After docker compose up, check Orthanc is using PostgreSQL
curl -u admin:yourpassword http://localhost:8042/system | python3 -m json.tool | grep -i database

# Expected output should show DatabaseVersion and no SQLite references
# Also check:
docker compose logs orthanc | grep -i "postgresql"
# You should see: "PostgreSQL index plugin is enabled"
```

```bash
# Connect to PostgreSQL directly and verify tables
docker compose exec postgres psql -U orthanc -d orthanc -c "\dt"

# Expected tables (Orthanc creates these automatically on first start):
# AttachedFiles, Changes, DicomIdentifiers, ExportedResources,
# GlobalIntegers, GlobalProperties, MainDicomTags, Metadata,
# PatientRecyclingOrder, Resources, ServerProperties
```

---

## Backup strategy

### What to backup
1. PostgreSQL database (index)
2. `orthanc-storage` volume (raw DICOM files)

Both must be backed up. If you restore only the DB without the files, Orthanc will have index entries pointing to missing files (and vice versa).

### Daily PostgreSQL backup script

```bash
#!/bin/bash
# /opt/pacs/scripts/backup-postgres.sh

set -euo pipefail

BACKUP_DIR="/opt/pacs/backups/postgres"
DATE=$(date +%Y%m%d_%H%M%S)
CONTAINER="orthanc-postgres"
DB_USER="orthanc"
DB_NAME="orthanc"
RETENTION_DAYS=30

mkdir -p "$BACKUP_DIR"

echo "[$(date)] Starting PostgreSQL backup..."

docker exec "$CONTAINER" pg_dump \
  -U "$DB_USER" \
  -Fc \
  "$DB_NAME" \
  > "$BACKUP_DIR/orthanc_${DATE}.dump"

echo "[$(date)] Backup complete: orthanc_${DATE}.dump"

# Remove backups older than retention period
find "$BACKUP_DIR" -name "*.dump" -mtime +${RETENTION_DAYS} -delete
echo "[$(date)] Old backups cleaned up"
```

```bash
# Make executable and add to cron
chmod +x /opt/pacs/scripts/backup-postgres.sh

# Run daily at 2am — add to root crontab
crontab -e
# Add: 0 2 * * * /opt/pacs/scripts/backup-postgres.sh >> /var/log/pacs-backup.log 2>&1
```

### Storage volume backup

```bash
#!/bin/bash
# Backup the DICOM storage volume
# Run this with rsync to a secondary storage location

set -euo pipefail

SOURCE="/var/lib/docker/volumes/orthanc-storage/_data"
DEST="/mnt/backup-storage/dicom"
DATE=$(date +%Y%m%d)

echo "[$(date)] Starting DICOM storage rsync..."

rsync -av --delete \
  --link-dest="$DEST/latest" \
  "$SOURCE/" \
  "$DEST/$DATE/"

# Update "latest" symlink
ln -sfn "$DEST/$DATE" "$DEST/latest"

echo "[$(date)] Storage backup complete"
```

### Restore procedure (test this before go-live)

```bash
# 1. Stop Orthanc (never restore while it's running)
docker compose stop orthanc

# 2. Restore PostgreSQL
docker compose exec postgres psql -U orthanc -c "DROP DATABASE orthanc;"
docker compose exec postgres psql -U orthanc -c "CREATE DATABASE orthanc;"
docker exec -i orthanc-postgres pg_restore \
  -U orthanc \
  -d orthanc \
  < /opt/pacs/backups/postgres/orthanc_20250317_020000.dump

# 3. Restore storage volume if needed (rsync back)
rsync -av /mnt/backup-storage/dicom/latest/ \
  /var/lib/docker/volumes/orthanc-storage/_data/

# 4. Start Orthanc and verify
docker compose start orthanc
curl -u admin:yourpassword http://localhost:8042/statistics
```

---

## PostgreSQL tuning (production)

Add these to your `postgres` service via a custom `postgresql.conf`:

```
# For a dedicated PACS server with 8GB RAM
shared_buffers = 2GB
effective_cache_size = 6GB
work_mem = 64MB
maintenance_work_mem = 512MB
max_connections = 100
wal_buffers = 64MB
checkpoint_completion_target = 0.9
```

Mount it:
```yaml
postgres:
  volumes:
    - ./postgres/postgresql.conf:/etc/postgresql/postgresql.conf
  command: postgres -c config_file=/etc/postgresql/postgresql.conf
```

---

## Do NOT do

1. Do not expose PostgreSQL port 5432 outside the Docker network
2. Do not use default postgres password — use a strong random password in `.env`
3. Do not backup only PostgreSQL without the storage volume (or vice versa)
4. Do not run `pg_dump` while Orthanc is under heavy write load without testing consistency
5. Do not use `ENABLE_STORAGE=true` — keeps files in DB BLOBs, makes backup/restore a nightmare
6. Do not skip testing the restore procedure before going live

---

## Done when
- [ ] `docker compose logs orthanc | grep postgresql` shows plugin enabled
- [ ] `docker exec orthanc-postgres psql -U orthanc -d orthanc -c "\dt"` shows Orthanc tables
- [ ] Upload a DICOM file, confirm it appears in both Orthanc and the PG `Resources` table
- [ ] Backup script runs without error
- [ ] Restore procedure tested once on a copy of the data
