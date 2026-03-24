# 08 — Production Deployment

## Full docker-compose.production.yml

```yaml
version: "3.8"

services:

  # ─── Orthanc DICOM Server ─────────────────────────────────
  orthanc:
    image: orthancteam/orthanc:latest
    container_name: orthanc
    expose:
      - "4242"
      - "8042"
    ports:
      - "4242:4242"   # DICOM — restrict at firewall to hospital network only
    volumes:
      - orthanc-storage:/var/lib/orthanc/storage
      - ./orthanc/orthanc.json:/etc/orthanc/orthanc.json:ro
      - ./orthanc/python:/etc/orthanc/python:ro
    environment:
      - ORTHANC__NAME=HospitalPACS
      - ORTHANC__DICOM_AET=HOSPITAL_PACS
      - ORTHANC__REMOTE_ACCESS_ALLOWED=true
      - ORTHANC__AUTHENTICATION_ENABLED=true
      - ORTHANC__REGISTERED_USERS={"admin":"${ADMIN_PASSWORD}"}
      - ORTHANC__POSTGRESQL__HOST=postgres
      - ORTHANC__POSTGRESQL__PORT=5432
      - ORTHANC__POSTGRESQL__DATABASE=orthanc
      - ORTHANC__POSTGRESQL__USERNAME=orthanc
      - ORTHANC__POSTGRESQL__PASSWORD=${DB_PASSWORD}
      - ORTHANC__POSTGRESQL__ENABLE_INDEX=true
      - ORTHANC__POSTGRESQL__ENABLE_STORAGE=false
      - ORTHANC__POSTGRESQL__INDEX_CONNECTIONS_COUNT=15
      - ORTHANC__DICOM_WEB__ENABLE=true
      - ORTHANC__DICOM_WEB__ROOT=/dicom-web/
      - ORTHANC__DICOM_WEB__ENABLE_WADO=true
      - ORTHANC__DICOM_WEB__WADO_ROOT=/wado
      - ORTHANC__ORTHANC_EXPLORER_2__ENABLE=true
      - ORTHANC__ORTHANC_EXPLORER_2__IS_DEFAULT_ORTHANC_UI=true
      - ORTHANC__DELAYED_DELETION__ENABLE=true
      - ORTHANC__LOG_EXPORTED_RESOURCES=true
    depends_on:
      postgres:
        condition: service_healthy
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "-u", "admin:${ADMIN_PASSWORD}", "http://localhost:8042/system"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 30s
    logging:
      driver: "json-file"
      options:
        max-size: "100m"
        max-file: "30"

  # ─── PostgreSQL ───────────────────────────────────────────
  postgres:
    image: postgres:15
    container_name: orthanc-postgres
    environment:
      - POSTGRES_DB=orthanc
      - POSTGRES_USER=orthanc
      - POSTGRES_PASSWORD=${DB_PASSWORD}
    volumes:
      - postgres-data:/var/lib/postgresql/data
      - ./postgres/postgresql.conf:/etc/postgresql/postgresql.conf
    command: postgres -c config_file=/etc/postgresql/postgresql.conf
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U orthanc -d orthanc"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped
    logging:
      driver: "json-file"
      options:
        max-size: "50m"
        max-file: "10"

  # ─── Next.js Application ─────────────────────────────────
  nextjs:
    build:
      context: ./nextjs
      dockerfile: Dockerfile
    container_name: nextjs
    expose:
      - "3000"
    environment:
      - NODE_ENV=production
      - ORTHANC_URL=http://orthanc:8042
      - ORTHANC_USERNAME=admin
      - ORTHANC_PASSWORD=${ADMIN_PASSWORD}
      - NEXTAUTH_SECRET=${NEXTAUTH_SECRET}
      - NEXTAUTH_URL=https://${DOMAIN}
    depends_on:
      orthanc:
        condition: service_healthy
    restart: unless-stopped

  # ─── OHIF Viewer ─────────────────────────────────────────
  ohif:
    image: ohif/app:latest
    container_name: ohif
    expose:
      - "80"
    volumes:
      - ./ohif/app-config.js:/usr/share/nginx/html/app-config.js:ro
    restart: unless-stopped

  # ─── nginx ────────────────────────────────────────────────
  nginx:
    image: nginx:alpine
    container_name: nginx
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./nginx/certs:/etc/nginx/certs:ro
    depends_on:
      - orthanc
      - nextjs
      - ohif
    restart: unless-stopped
    logging:
      driver: "json-file"
      options:
        max-size: "50m"
        max-file: "10"

volumes:
  orthanc-storage:
    driver: local
  postgres-data:
    driver: local
```

---

## .env.production (never commit this file)

```bash
# Domain
DOMAIN=pacs.yourhospital.co.id

# Database
DB_PASSWORD=<strong-random-password-min-32-chars>

# Orthanc admin
ADMIN_PASSWORD=<strong-random-password>

# Next.js auth
NEXTAUTH_SECRET=<strong-random-secret-min-32-chars>
```

Generate strong passwords:
```bash
openssl rand -base64 32
```

---

## Next.js Dockerfile

```dockerfile
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --only=production

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
ENV PORT 3000

CMD ["node", "server.js"]
```

---

## Health check endpoints

### Orthanc
```bash
curl -u admin:pass http://localhost:8042/system
# Returns: {"Name":"HospitalPACS","Version":"...","DatabaseVersion":...}

curl -u admin:pass http://localhost:8042/statistics
# Returns: {"CountInstances":N,"CountSeries":N,"CountStudies":N,"CountPatients":N,...}
```

### PostgreSQL
```bash
docker compose exec postgres pg_isready -U orthanc -d orthanc
```

### Full stack check script
```bash
#!/bin/bash
# /opt/pacs/scripts/healthcheck.sh

set -euo pipefail

echo "=== PACS Health Check $(date) ==="

# Orthanc
SYSTEM=$(curl -sf -u admin:${ADMIN_PASSWORD} http://localhost:8042/system)
if [ $? -eq 0 ]; then
  echo "✓ Orthanc: OK"
  echo "  Version: $(echo $SYSTEM | python3 -c 'import sys,json; print(json.load(sys.stdin)["Version"])')"
else
  echo "✗ Orthanc: FAILED"
fi

# PostgreSQL
if docker compose exec -T postgres pg_isready -U orthanc -d orthanc > /dev/null 2>&1; then
  echo "✓ PostgreSQL: OK"
else
  echo "✗ PostgreSQL: FAILED"
fi

# nginx / HTTPS
HTTP_CODE=$(curl -sf -o /dev/null -w "%{http_code}" https://localhost/ --insecure 2>/dev/null || echo "000")
if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "301" ]; then
  echo "✓ nginx: OK (HTTP $HTTP_CODE)"
else
  echo "✗ nginx: FAILED (HTTP $HTTP_CODE)"
fi

# DICOMweb
STUDIES=$(curl -sf -u admin:${ADMIN_PASSWORD} http://localhost:8042/dicom-web/studies | python3 -c 'import sys,json; print(len(json.load(sys.stdin)))' 2>/dev/null || echo "ERROR")
echo "✓ DICOMweb: $STUDIES studies indexed"

echo "=== End Health Check ==="
```

---

## Deployment procedure (first time)

```bash
# 1. Clone/copy your project to the server
git clone your-repo /opt/pacs
cd /opt/pacs

# 2. Create .env.production — fill in all values
cp .env.example .env.production
vim .env.production

# 3. Generate TLS certificate
mkdir -p nginx/certs
# Option A: self-signed (dev/staging)
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout nginx/certs/privkey.pem \
  -out nginx/certs/fullchain.pem \
  -subj "/CN=${DOMAIN}"
# Option B: Let's Encrypt (production)
# See 07-auth-security.md

# 4. Start the stack
docker compose -f docker-compose.production.yml --env-file .env.production up -d

# 5. Check all containers are running
docker compose ps

# 6. Run health check
export ADMIN_PASSWORD=$(grep ADMIN_PASSWORD .env.production | cut -d= -f2)
bash /opt/pacs/scripts/healthcheck.sh

# 7. Verify from a browser
# https://your-domain.com → Next.js app
# https://your-domain.com/orthanc/ui/app/ → Orthanc Explorer 2
```

---

## Update procedure

```bash
cd /opt/pacs

# Pull latest images
docker compose -f docker-compose.production.yml pull

# Rebuild Next.js if changed
docker compose -f docker-compose.production.yml build nextjs

# Rolling restart (Orthanc last — preserves DICOM availability)
docker compose -f docker-compose.production.yml up -d nextjs nginx ohif
sleep 10
docker compose -f docker-compose.production.yml up -d orthanc

# Verify
bash /opt/pacs/scripts/healthcheck.sh
```

---

## Done when
- [ ] All 5 containers running: `docker compose ps` shows all healthy
- [ ] `https://your-domain.com` loads Next.js app
- [ ] `https://your-domain.com/orthanc/ui/app/` loads Orthanc Explorer 2
- [ ] Healthcheck script passes all checks
- [ ] Port 8042 NOT accessible from outside: `curl http://server-ip:8042` times out
- [ ] C-STORE test from DCMTK succeeds: `storescu -aet TEST -aec HOSPITAL_PACS server-ip 4242 test.dcm`
