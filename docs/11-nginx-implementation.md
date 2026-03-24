# Phase 2: nginx Reverse Proxy with TLS

**Implementation Date:** 2026-03-24
**Status:** ✅ Complete

---

## Overview

Added nginx as a reverse proxy with TLS termination to secure the PACS system. Orthanc is no longer directly accessible on port 8042, all external traffic now goes through nginx on port 443 (HTTPS).

---

## What Was Implemented

### 1. nginx Container
- **Image:** nginx:alpine
- **Ports:** 80 (HTTP), 443 (HTTPS)
- **Features:**
  - TLS 1.2/1.3 with strong ciphers
  - Automatic HTTP→HTTPS redirect
  - Rate limiting (30 req/s, 10 burst)
  - Security headers (HSTS, X-Frame-Options, etc.)
  - Path rewriting: `/orthanc/*` → Orthanc
  - Large file support (500MB, 300s timeouts)

### 2. TLS Certificates (Development)
- **Type:** Self-signed
- **Duration:** 365 days
- **Location:** `Orthanc/nginx/certs/`
- **Production:** Replace with Let's Encrypt

### 3. Network Architecture
- Created internal `pacs-network` bridge network
- Orthanc port 8042 accessible only internally
- DICOM port 4242 remains exposed for modalities

---

## Files Created

```
Orthanc/
├── nginx/
│   ├── nginx.conf          # nginx configuration
│   └── certs/
│       ├── fullchain.pem   # TLS certificate
│       └── privkey.pem     # Private key
```

## Files Modified

### `docker-compose.yml`
```yaml
# Added nginx service
nginx:
  image: nginx:alpine
  ports:
    - "80:80"
    - "443:443"
  depends_on:
    - orthanc

# Modified orthanc service
orthanc:
  ports:
    - "4242:4242"   # DICOM only
    # Removed: "8042:8042" - now internal only
  networks:
    - pacs-network

# Added network
networks:
  pacs-network:
    driver: bridge
```

### `orthanc.json`
Fixed duplicate plugin loading:
```json
"Plugins": [
  "/usr/share/orthanc/plugins"
  // Removed: duplicate libDelayedDeletion.so
]
```

---

## Access URLs

| Purpose | URL |
|---------|-----|
| Web UI | `https://localhost/orthanc/ui/app/` |
| DICOMweb | `https://localhost/orthanc/dicom-web/*` |
| System API | `https://localhost/orthanc/system` |
| DICOM C-STORE | `localhost:4242` |

**Note:** Browser will show self-signed cert warning (expected for development)

---

## Verification Commands

```bash
# Check containers
docker compose ps

# Test HTTP→HTTPS redirect
curl -I http://localhost

# Test HTTPS access
curl -k -u admin:admin https://localhost/orthanc/system

# Test DICOMweb
curl -k -u admin:admin https://localhost/orthanc/dicom-web/studies

# Verify port 8042 is blocked
curl http://localhost:8042/system
# Should return: Connection refused

# Test rate limiting
for i in {1..40}; do
  curl -k -s -o /dev/null -w "%{http_code}\n" https://localhost/orthanc/system
done
# Expected: ~28x 401, ~12x 503
```

---

## Security Improvements

| Feature | Before | After |
|---------|--------|-------|
| TLS encryption | ❌ None | ✅ TLS 1.2/1.3 |
| Port 8042 exposed | ❌ Yes | ✅ No (internal only) |
| Rate limiting | ❌ None | ✅ 30 req/s |
| Security headers | ❌ None | ✅ Full set |
| HTTP→HTTPS | ❌ No | ✅ Automatic |

---

## Architecture

```
Before:
[Internet] → port 8042 → [Orthanc]

After:
[Internet] → port 443 (HTTPS) → [nginx] → internal → [Orthanc]
               ↓ (redirect)
           port 80 → [nginx] → redirect to 443
```

---

## Known Limitations

1. **Self-signed certificate** - Browser warnings (dev only)
2. **Basic auth only** - JWT authorization in Phase 3
3. **DICOM port exposed** - Needs firewall rules in production

---

## Next Steps

**Phase 3 will add:**
1. Next.js application with modern UI
2. OHIF/Cornerstone3D DICOM viewer
3. JWT-based authorization plugin
4. Production TLS certificates (Let's Encrypt)

---

**Status:** Ready for Phase 3 development
**Documentation:** See `PROGRESS.md` for complete implementation history
