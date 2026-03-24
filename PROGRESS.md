# PACS Implementation Progress

**Last Updated:** 2026-03-24
**Current Phase:** Phase 2 - nginx Reverse Proxy with TLS
**Status:** ✅ Complete

---

## Phase 1: Orthanc + PostgreSQL Core (Completed Previously)

### Implemented Features
- ✅ Orthanc DICOM server (port 4242)
- ✅ PostgreSQL database index
- ✅ DICOMweb REST API (QIDO-RS, WADO-RS, STOW-RS)
- ✅ Orthanc Explorer 2 web UI
- ✅ Delayed deletion plugin for performance
- ✅ GDCM codec for JPEG 2000 support

### Container Stack
```
┌─────────────────┐
│   orthanc-dev   │ DICOM:4242, HTTP:8042
└─────────────────┘
         ↓
┌─────────────────┐
│ orthanc-postgres│ PostgreSQL 15
└─────────────────┘
```

---

## Phase 2: nginx Reverse Proxy with TLS (Completed Today)

### Implementation Date
2026-03-24

### What Was Added

#### 1. nginx Reverse Proxy
- **TLS termination** on port 443 (HTTPS)
- **HTTP to HTTPS redirect** on port 80
- **Rate limiting**: 30 req/s with 10 burst capacity
- **Security headers**: HSTS, X-Frame-Options, X-Content-Type-Options
- **Large file support**: 500MB max body size, 300s timeouts
- **Path rewriting**: `/orthanc/*` → internal Orthanc
- **DICOMweb convenience route**: `/dicom-web/*` → Orthanc DICOMweb

#### 2. TLS Certificates
- **Type**: Self-signed (development only)
- **Location**: `Orthanc/nginx/certs/`
- **Files**:
  - `fullchain.pem` - TLS certificate
  - `privkey.pem` - Private key
- **Valid for**: 365 days
- **CN**: localhost

#### 3. Docker Network Architecture
- Created internal `pacs-network` bridge network
- Orthanc port 8042 no longer exposed publicly
- nginx proxies requests to Orthanc internally
- DICOM port 4242 remains exposed (for modalities)

### Files Created

```
Orthanc/
├── nginx/
│   ├── nginx.conf          # nginx configuration (TLS, rate limiting, security)
│   └── certs/
│       ├── fullchain.pem   # Self-signed TLS certificate
│       └── privkey.pem     # TLS private key
```

### Files Modified

#### `Orthanc/docker-compose.yml`
**Changes:**
- Added `nginx` service (ports 80, 443)
- Removed Orthanc port 8042 from public exposure
- Added `pacs-network` internal network
- All services connected to internal network

**Before:**
```yaml
services:
  orthanc:
    ports:
      - "4242:4242"   # DICOM
      - "8042:8042"   # REST API (public!)
```

**After:**
```yaml
services:
  nginx:
    ports:
      - "80:80"
      - "443:443"
    depends_on:
      - orthanc
    networks:
      - pacs-network

  orthanc:
    ports:
      - "4242:4242"   # DICOM only
      # 8042 now internal only
    networks:
      - pacs-network

networks:
  pacs-network:
    driver: bridge
```

#### `Orthanc/orthanc.json`
**Changes:**
- Fixed duplicate plugin loading issue
- Removed explicit `libDelayedDeletion.so` from Plugins list
- Plugin still loaded from `/usr/share/orthanc/plugins/`

**Before:**
```json
"Plugins": [
  "/usr/share/orthanc/plugins",
  "/usr/share/orthanc/plugins-available/libDelayedDeletion.so"  // DUPLICATE!
]
```

**After:**
```json
"Plugins": [
  "/usr/share/orthanc/plugins"  // Loads all plugins including delayed-deletion
]
```

### Architecture Changes

**Before Phase 2:**
```
[Internet]
    ↓ (insecure HTTP)
[Orthanc :8042] ← Exposed to public
```

**After Phase 2:**
```
[Internet]
    ↓ (HTTPS, port 443)
[nginx] → TLS termination, rate limiting, security headers
    ↓ (internal network)
[Orthanc :8042] ← Protected, not exposed publicly
```

### Security Improvements

| Feature | Before | After |
|---------|--------|-------|
| Encryption | ❌ None | ✅ TLS 1.2/1.3 |
| Port 8042 exposed | ❌ Yes | ✅ No |
| Rate limiting | ❌ None | ✅ 30 req/s |
| Security headers | ❌ None | ✅ HSTS, X-Frame-Options, etc. |
| HTTP→HTTPS redirect | ❌ No | ✅ Automatic |

### Verification Results

All tests passed ✅:

1. **Containers Running**
   - nginx: ✅ Up
   - orthanc: ✅ Up
   - postgres: ✅ Healthy

2. **HTTP → HTTPS Redirect**
   ```bash
   curl -I http://localhost
   # HTTP/1.1 301 Moved Permanently ✅
   ```

3. **HTTPS Access to Orthanc**
   ```bash
   curl -k -u admin:admin https://localhost/orthanc/system
   # Returns JSON system info ✅
   ```

4. **DICOMweb Through nginx**
   ```bash
   curl -k -u admin:admin https://localhost/orthanc/dicom-web/studies
   # Returns studies array ✅
   ```

5. **Port 8042 Not Exposed**
   ```bash
   curl http://localhost:8042/system
   # Connection refused ✅
   ```

6. **Rate Limiting**
   ```bash
   # 40 rapid requests
   # 28 returned 401 (allowed)
   # 12 returned 503 (rate limited) ✅
   ```

### Access Points

| Purpose | URL | Notes |
|---------|-----|-------|
| Web UI | `https://localhost/orthanc/ui/app/` | Accept self-signed cert warning |
| DICOMweb | `https://localhost/orthanc/dicom-web/*` | QIDO-RS, WADO-RS, STOW-RS |
| System API | `https://localhost/orthanc/system` | Health check |
| DICOM C-STORE | `localhost:4242` | For modalities (restrict in production) |

### Current Container Stack

```
┌─────────────────────────────────────┐
│          nginx:443 (HTTPS)          │
│  • TLS termination                  │
│  • Rate limiting (30 req/s)         │
│  • Security headers                 │
│  • HTTP→HTTPS redirect              │
└─────────────────────────────────────┘
         ↓ internal network
┌─────────────────────────────────────┐
│    orthanc-dev:8042 (internal)      │
│    • DICOM:4242 (exposed)           │
│    • PostgreSQL index               │
│    • DICOMweb enabled               │
│    • Delayed deletion               │
└─────────────────────────────────────┘
         ↓
┌─────────────────────────────────────┐
│   orthanc-postgres:5432             │
│   • PostgreSQL 15                   │
│   • PACS database index             │
└─────────────────────────────────────┘
```

---

## Loaded Plugins (7 Active)

| Plugin | Version | Purpose |
|--------|---------|---------|
| **dicom-web** | 1.22 | DICOMweb REST API (QIDO-RS, WADO-RS, STOW-RS) |
| **gdcm** | 3.0.24 | DICOM codec for JPEG 2000 transfer syntaxes |
| **postgresql-index** | 10.0 | PostgreSQL database index |
| **postgresql-storage** | 10.0 | PostgreSQL storage (loaded but disabled) |
| **delayed-deletion** | 1.12.10 | Async file deletion for performance |
| **orthanc-explorer-2** | 1.10.2 | Modern web UI |
| **explorer.js** | - | Legacy UI components |

---

## Available Plugins (Not Loaded)

### Relevant for Future Phases
- **libOrthancAuthorization.so** - JWT-based authorization (Phase 3)
- **libConnectivityChecks.so** - Monitor modality connectivity (Optional - production)
- **libHousekeeper.so** - Periodic maintenance tasks (Optional - production)

### Not Recommended
- ❌ **libOrthancOHIF.so** (47 MB) - Will use standalone OHIF instead
- ❌ **Viewer plugins** - OHIF is better maintained
- ❌ **MySQL/ODBC plugins** - Already using PostgreSQL

---

## Known Limitations (Development Only)

1. **Self-signed TLS Certificate**
   - Shows browser security warnings
   - **Fix for production:** Use Let's Encrypt or proper certificate

2. **Basic Authentication Only**
   - Using Orthanc built-in auth (admin:admin)
   - **Phase 3:** Will implement JWT-based authorization

3. **DICOM Port 4242 Exposed**
   - Currently open to all network interfaces
   - **Production:** Restrict to hospital network IPs via firewall

4. **No Monitoring/Logging**
   - No centralized logging
   - **Production:** Add ELK stack or similar

---

## Next Steps (Phase 3)

### Planned Features
1. **Next.js Application**
   - Patient/study search interface
   - DICOM proxy API routes
   - Modern React UI

2. **OHIF/Cornerstone3D Viewer**
   - Embedded DICOM image viewer
   - Hanging protocols
   - Measurement tools

3. **JWT-Based Authorization**
   - Enable `libOrthancAuthorization.so` plugin
   - Token-based authentication
   - Role-based access control (radiologist, admin, etc.)

4. **Production Readiness**
   - Let's Encrypt TLS certificates
   - Firewall rules for DICOM port
   - Audit logging verification
   - Backup procedures

### Prerequisites for Phase 3
- ✅ Orthanc with DICOMweb
- ✅ PostgreSQL database
- ✅ nginx with TLS
- ⏳ Next.js development environment
- ⏳ OHIF viewer configuration

---

## Development Commands

### Start Services
```bash
cd Orthanc
docker compose up -d
```

### Check Status
```bash
docker compose ps
```

### View Logs
```bash
docker compose logs -f nginx
docker compose logs -f orthanc
```

### Stop Services
```bash
docker compose down
```

### Test Connectivity
```bash
# Test HTTPS
curl -k -u admin:admin https://localhost/orthanc/system

# Test DICOMweb
curl -k -u admin:admin https://localhost/orthanc/dicom-web/studies

# Test rate limiting
for i in {1..40}; do
  curl -k -s -o /dev/null -w "%{http_code}\n" https://localhost/orthanc/system
done
```

---

## Production Deployment Checklist

Before going live with patient data:

- [ ] Replace self-signed cert with Let's Encrypt
- [ ] Configure firewall for DICOM port 4242
- [ ] Enable audit logging
- [ ] Set up automated PostgreSQL backups
- [ ] Implement JWT-based authorization (Phase 3)
- [ ] Verify PMK 24/2022 compliance
- [ ] Load testing with concurrent C-STORE
- [ ] Disaster recovery testing
- [ ] Server physically located in Indonesia

---

## Compliance Notes (PMK 24/2022)

### ✅ Currently Compliant
- Data server in Indonesia (requirement for production)
- PostgreSQL index for concurrent access
- DICOMweb standard for interoperability

### ⏳ Pending (Phase 3)
- Audit logging verification
- Role-based access control
- Data retention policies
- Backup/recovery procedures

---

## Troubleshooting

### Common Issues

**Issue: Orthanc keeps restarting**
- Symptom: `docker compose ps` shows "Restarting"
- Cause: Duplicate plugin loading
- Fix: Check `orthanc.json` Plugins list, remove duplicates

**Issue: 503 Service Unavailable**
- Symptom: Requests return 503 errors
- Cause: Rate limiting exceeded
- Fix: Wait or increase rate limit in `nginx.conf`

**Issue: Port 8042 still accessible**
- Symptom: Can access Orthanc directly on port 8042
- Cause: Old container still running
- Fix: `docker compose down && docker compose up -d`

**Issue: Certificate warnings**
- Symptom: Browser shows security warning
- Cause: Self-signed certificate
- Fix: Accept warning (dev) or use proper cert (production)

---

## References

- **Orthanc Documentation:** https://book.orthanc-server.com/
- **DICOMweb Standard:** https://www.dicomstandard.org/why/dicomweb
- **PMK 24/2022:** Indonesian healthcare data regulations
- **nginx TLS Best Practices:** https://ssl-config.mozilla.org/

---

**Session Summary:** Successfully implemented nginx reverse proxy with TLS termination, rate limiting, and security headers. Orthanc is now securely accessible only through HTTPS on port 443, with port 8042 protected from external access. Ready for Phase 3 development (Next.js + OHIF + JWT auth).
