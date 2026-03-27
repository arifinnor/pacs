# PACS Implementation Progress

**Last Updated:** 2026-03-27
**Current Phase:** Phase 4 - OHIF DICOM Viewer
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

#### `docker-compose.yml` (moved from Orthanc/ to root)
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
- **libOrthancAuthorization.so** - Loaded but unused (JWT handled by nginx auth_request)
- **libConnectivityChecks.so** - Monitor modality connectivity (Optional - production)
- **libHousekeeper.so** - Periodic maintenance tasks (Optional - production)

### Not Recommended
- ❌ **libOrthancOHIF.so** (47 MB) - Using standalone OHIF container instead
- ❌ **Viewer plugins** - Standalone OHIF is better maintained
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

---

## Phase 3: JWT-Based Authorization (Completed Today)

### Implementation Date
2026-03-24

### What Was Added

#### 1. Auth Service (Node.js/TypeScript)
- **Framework:** Fastify web server
- **Authentication:** JWT tokens with @fastify/jwt
- **Password Security:** Bcrypt hashing (cost factor 12)
- **Database:** PostgreSQL user storage
- **Port:** 8000

#### 2. User Management
- **Roles:** admin, radiologist, viewer
- **Registration:** Public endpoint with role assignment
- **Login:** Username/password authentication
- **Token Refresh:** Single-use refresh tokens (7 days)
- **Logout:** Token revocation

#### 3. JWT Token Strategy
- **Access Token:** 15 minute lifetime
- **Refresh Token:** 7 day lifetime
- **Storage:** PostgreSQL allowlist for revocation
- **Validation:** Orthanc Authorization Plugin integration

#### 4. nginx JWT Validation (auth_request)
- **Method:** nginx `auth_request` subrequest to auth-service
- **Validation URL:** http://auth-service:8000/auth/validate
- **On success:** nginx injects basic auth header for Orthanc
- **Protected routes:** `/orthanc/`, `/dicom-web/`, `/wado`
- **Unprotected routes:** `/auth/`, `/viewer/`

### Files Created

```
docker-compose.yml                  # Service orchestration (moved from orthanc/)
.env.example                       # Environment template (moved from orthanc/)

auth-service/
├── package.json                    # Node.js dependencies
├── tsconfig.json                   # TypeScript configuration
├── Dockerfile                      # Container build
├── .dockerignore                   # Docker exclusions
├── setup.sh                        # Automated setup script
├── test.sh                         # Automated test script
├── README.md                       # Service documentation
├── QUICKREF.md                     # Quick reference card
└── src/
    ├── config.ts                   # Configuration
    ├── index.ts                    # Fastify server
    ├── auth.ts                     # JWT functions
    ├── db/
    │   ├── index.ts                # Database connection & types
    │   └── migrate.ts              # Migration script
    └── routes/
        └── auth.ts                 # Auth API routes

docs/
└── jwt-authorization-guide.md     # Complete usage guide
```

### Files Modified

#### `docker-compose.yml` (moved from orthanc/ to root)
**Changes:**
- Added `auth-service` service (port 8000)
- Added authorization environment variables to Orthanc
- Updated Orthanc depends_on to include auth-service healthcheck
- Updated volume paths to use lowercase `orthanc/` directory

**New Service:**
```yaml
auth-service:
  build: ./auth-service
  container_name: pacs-auth-service
  # Port 8000 is internal only — accessed through nginx
  environment:
    - DATABASE_URL=postgresql://orthanc:${DB_PASSWORD}@postgres:5432/orthanc
    - JWT_SECRET_KEY=${JWT_SECRET_KEY}
    - CORS_ORIGINS=http://localhost:3000,https://localhost
    - PORT=8000
    - HOST=0.0.0.0
  depends_on:
    postgres:
      condition: service_healthy
  healthcheck:
    test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:8000/"]
    interval: 30s
    timeout: 10s
    retries: 3
```

**JWT Authorization (via nginx auth_request):**
JWT validation is handled by nginx, not the Orthanc Authorization Plugin.
nginx validates tokens via `auth_request` subrequest to auth-service,
then injects basic auth credentials for Orthanc on success.

#### `.env.example` (moved from orthanc/ to root)
**Changes:**
- Added JWT_SECRET_KEY template
- Added instructions for generating secure secret

**New Section:**
```bash
# ==============================================================================
# JWT AUTHENTICATION
# ==============================================================================
# Secret key for JWT token signing and validation
# Generate with: openssl rand -hex 32
# Requirements: Minimum 32 characters, random and unpredictable
# Rotate this key every 90 days in production
JWT_SECRET_KEY=your_super_secret_jwt_key_change_in_production_minimum_32_characters
```

### Architecture Changes

**Before Phase 3:**
```
[User] → Basic Auth (admin:admin)
    ↓
[nginx] → Forwards credentials
    ↓
[Orthanc] → Validates built-in users
```

**After Phase 3:**
```
[User] → Login Request (POST /auth/login)
    ↓
[nginx :443] → [Auth Service :8000]
    ↓ (verifies credentials against PostgreSQL)
[Auth Service] → Access Token (15min) + Refresh Token (7days)
    ↓
[User] → Request with Bearer token
    ↓
[nginx :443] → auth_request subrequest to Auth Service
    ↓ (GET /auth/validate with token)
[Auth Service] → Verifies JWT signature + checks database
    ↓ (200 OK)
[nginx] → Injects basic auth header → [Orthanc] → Processes request
```

### Database Schema

#### New Tables

**users:**
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(255) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  hashed_password VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'viewer',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  last_login TIMESTAMP WITH TIME ZONE
);
```

**refresh_tokens:**
```sql
CREATE TABLE refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token VARCHAR(500) UNIQUE NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  revoked BOOLEAN DEFAULT false
);
```

**Indexes:**
- idx_users_username
- idx_users_email
- idx_refresh_tokens_token
- idx_refresh_tokens_user_id

### API Endpoints

| Endpoint | Method | Description | Auth Required |
|----------|--------|-------------|---------------|
| `/` | GET | Health check | No |
| `/auth/register` | POST | Register new user | No |
| `/auth/login` | POST | Login (get tokens) | No |
| `/auth/refresh` | POST | Refresh access token | No |
| `/auth/validate` | POST | Validate JWT (Orthanc) | No |
| `/auth/me` | GET | Get current user | Yes |
| `/auth/logout` | POST | Logout (revoke token) | No |

### User Roles

| Role | Permissions |
|------|-------------|
| **admin** | Full access, user management, system config |
| **radiologist** | View/write studies, create reports, delete |
| **viewer** | Read-only access to studies |

### Security Features

| Feature | Implementation |
|---------|----------------|
| Password Hashing | Bcrypt with cost factor 12 |
| Access Token Lifetime | 15 minutes |
| Refresh Token Lifetime | 7 days |
| Token Revocation | PostgreSQL allowlist |
| Token Validation | JWT signature + database check |
| Password Requirements | Min 8 characters |
| CORS Origins | Configurable via env var |
| JWT Secret | Minimum 32 characters |

### Backward Compatibility

**Basic auth still works during transition:**
```bash
# Old way (still works)
curl -u admin:admin http://localhost:8042/patients

# New way (JWT)
curl -H "Authorization: Bearer $TOKEN" http://localhost:8042/patients
```

### Container Stack (after Phase 3)

```
┌─────────────────────────────────────┐
│          nginx:443 (HTTPS)          │
│  • TLS termination                  │
│  • Rate limiting (30 req/s)         │
│  • JWT validation (auth_request)    │
│  • HTTP→HTTPS redirect              │
└─────────────────────────────────────┘
         ↓ internal network
┌─────────────────────────────────────┐
│    orthanc-dev:8042 (internal)      │
│    • DICOM:4242 (exposed)           │
│    • PostgreSQL index               │
│    • DICOMweb enabled               │
└─────────────────────────────────────┘
         ↓                    ↓
┌──────────────────┐  ┌──────────────────────┐
│ auth-service:8000│  │ orthanc-postgres:5432│
│ • JWT validation │  │ • Orthanc data       │
│ • User storage   │  │ • User management    │
│ • Internal only  │  │                      │
└──────────────────┘  └──────────────────────┘
```

### Verification Results

All tests should pass ✅:

1. **Auth Service Health Check**
   ```bash
   curl http://localhost:8000/
   # {"status":"ok","service":"pacs-auth-service"} ✅
   ```

2. **User Registration**
   ```bash
   curl -X POST http://localhost:8000/auth/register \
     -H "Content-Type: application/json" \
     -d '{"username":"test","email":"test@example.com","password":"password123"}'
   # Returns user object ✅
   ```

3. **User Login**
   ```bash
   curl -X POST http://localhost:8000/auth/login \
     -H "Content-Type: application/json" \
     -d '{"username":"test","password":"password123"}'
   # Returns access_token and refresh_token ✅
   ```

4. **Token Validation**
   ```bash
   curl -X POST http://localhost:8000/auth/validate \
     -H "Authorization: Bearer $TOKEN"
   # {"granted": true, "validity": 60} ✅
   ```

5. **Get Current User**
   ```bash
   curl http://localhost:8000/auth/me \
     -H "Authorization: Bearer $TOKEN"
   # Returns user object ✅
   ```

6. **Database Tables**
   ```bash
   docker compose exec postgres psql -U orthanc -d orthanc -c "\dt"
   # users and refresh_tokens tables visible ✅
   ```

7. **Orthanc with JWT**
   ```bash
   curl -H "Authorization: Bearer $TOKEN" http://localhost:8042/patients
   # Returns patient list ✅
   ```

### Setup Instructions

1. **Generate JWT Secret**
   ```bash
   openssl rand -hex 32
   ```

2. **Update Environment**
   ```bash
   # From project root
   cp .env.example .env
   echo "JWT_SECRET_KEY=<generated-secret>" >> .env
   ```

3. **Start Services**
   ```bash
   # From project root
   docker compose up -d
   ```

4. **Run Migrations**
   ```bash
   # From project root
   docker compose exec auth-service npm run db:migrate
   ```

5. **Create Admin User**
   ```bash
   curl -X POST http://localhost:8000/auth/register \
     -H "Content-Type: application/json" \
     -d '{
       "username": "admin",
       "email": "admin@pacs.local",
       "password": "secure_password",
       "role": "admin"
     }'
   ```

6. **Test Login**
   ```bash
   curl -X POST http://localhost:8000/auth/login \
     -H "Content-Type: application/json" \
     -d '{"username": "admin", "password": "secure_password"}'
   ```

### Troubleshooting

**Issue: Auth service not starting**
- Check JWT_SECRET_KEY is set in .env
- Verify DATABASE_URL is correct
- Check logs: `docker compose logs auth-service`

**Issue: Token validation fails**
- Verify JWT_SECRET_KEY matches between services
- Check token hasn't expired (15 min)
- Ensure user has valid refresh tokens

**Issue: Migration fails**
- Ensure PostgreSQL is healthy: `docker compose ps postgres`
- Check DATABASE_URL environment variable
- Verify postgres credentials

**Issue: Orthanc authorization not working**
- Check Orthanc logs: `docker compose logs orthanc | grep -i authorization`
- Verify auth service is accessible from Orthanc container
- Check ORTHANC__AUTHORIZATION__ENABLE=true

### Security Considerations

**Production Requirements:**
- ✅ Strong JWT secret (32+ characters, randomly generated)
- ✅ Password hashing with bcrypt
- ✅ Token expiration (access: 15min, refresh: 7days)
- ✅ Token revocation on logout
- ⏳ Password reset flow (future enhancement)
- ⏳ Two-factor authentication (future enhancement)
- ⏳ Account lockout after failed attempts (future enhancement)

**Compliance (PMK 24/2022):**
- ✅ User authentication and authorization
- ✅ Role-based access control
- ✅ Audit trail (user context in Orthanc logs)
- ✅ Data residency (auth service in Indonesia)
- ⏳ Password complexity requirements (follows NIST guidelines)
- ⏳ Session timeout (15 min access token)

### Known Limitations

1. **No Password Reset Flow**
   - Users must contact admin to reset password
   - **Future:** Implement email-based password reset

2. **No Two-Factor Authentication**
   - Single-factor authentication only
   - **Future:** Add TOTP or SMS-based 2FA

3. **No User Invitation System**
   - Admin must manually register users
   - **Future:** Add invitation email flow

4. **No Account Lockout**
   - No protection against brute force
   - **Future:** Implement rate limiting and lockout

5. **No Study-Level Permissions**
   - All users can access all studies
   - **Future:** Implement patient-based access control

### Future Enhancements

- [ ] Password reset endpoint with email verification
- [ ] Two-factor authentication (TOTP)
- [ ] Account lockout after failed login attempts
- [ ] User invitation system with email
- [ ] Study-level permissions (user can only access assigned studies)
- [ ] External IdP integration (Keycloak, Auth0)
- [ ] Admin UI for user management
- [ ] Audit logging endpoint for compliance reporting

### Documentation

- **Service README:** `auth-service/README.md`
- **Quick Reference:** `auth-service/QUICKREF.md`
- **JWT Auth Guide:** `docs/jwt-authorization-guide.md`
- **API Documentation:** `docs/api-documentation.md` (NEW)
- **Postman Collection:** `docs/postman-collection.json` (NEW)
- **Setup Script:** `auth-service/setup.sh`
- **Test Script:** `auth-service/test.sh`

---

## Phase 4: OHIF DICOM Viewer (Completed)

### Implementation Date
2026-03-27

### What Was Added

#### 1. OHIF Viewer Service
- **Image:** `ohif/app:v3.10.2`
- **Access URL:** `https://localhost/viewer/`
- **Internal port:** 80 (not exposed — accessed only through nginx)
- **Config:** `ohif/app-config.js` mounted into container

#### 2. OHIF nginx Integration
- `/viewer/` → OHIF SPA (no auth, static assets)
- `/ohif-dicom-web/` → Orthanc DICOMweb (basic auth injected, no JWT)
- `/ohif-wado` → Orthanc WADO-URI (basic auth injected, no JWT)
- `/` catch-all → OHIF webpack chunks (built with `PUBLIC_URL=/`)

#### 3. Asset Path Rewriting
OHIF is built with `PUBLIC_URL=/` but served under `/viewer/`.
An idempotent `sed` entrypoint rewrites `index.html` asset paths to `/viewer/` at container startup.
Webpack code-split chunks still load from `/` and are caught by the nginx catch-all.

#### 4. Auth Strategy
OHIF uses dedicated nginx proxy endpoints (`/ohif-dicom-web/`, `/ohif-wado`) that inject basic auth without requiring JWT. This keeps the viewer SPA stateless — no token management needed in client-side JavaScript.

The JWT-protected endpoints (`/dicom-web/`, `/wado`) remain unchanged for API clients and the planned Next.js frontend.

### Files Created

```
ohif/
└── app-config.js          # OHIF runtime config (DICOMweb endpoints)
```

### Files Modified

- `docker-compose.yml` — Added OHIF service with sed entrypoint
- `orthanc/nginx/nginx.conf` — Added OHIF upstream, viewer/proxy/catch-all locations
- `CLAUDE.md` — Updated tech stack, data flow, routing docs
- `docs/api-documentation.md` — Added WADO-URI and OHIF Viewer sections
- `docs/postman-collection.json` — Added WADO-URI and OHIF Viewer folders

### Current Container Stack

```
┌─────────────────────────────────────┐
│          nginx:443 (HTTPS)          │
│  • TLS termination                  │
│  • Rate limiting (30 req/s)         │
│  • JWT validation (auth_request)    │
│  • OHIF reverse proxy (/viewer/)    │
└─────────────────────────────────────┘
    ↓              ↓              ↓
┌──────────┐ ┌──────────┐ ┌──────────────────┐
│ OHIF     │ │ Orthanc  │ │ auth-service     │
│ :80      │ │ :8042    │ │ :8000            │
│ (viewer) │ │ (DICOM)  │ │ (JWT validation) │
└──────────┘ └──────────┘ └──────────────────┘
                  ↓              ↓
             ┌──────────────────────┐
             │ PostgreSQL :5432     │
             │ • Orthanc index      │
             │ • User management    │
             └──────────────────────┘
```

### Verification

1. Open `https://localhost/viewer/` — OHIF loads with study list
2. Click a study — images render in the viewer
3. JWT-protected endpoints still require tokens: `curl -sk https://localhost/dicom-web/studies` returns 401
4. All 5 containers healthy: `docker compose ps`

---

## Next Steps (Phase 5)

### Planned Features
1. **Next.js Application**
   - Patient/study search interface
   - JWT authentication integration
   - DICOM proxy API routes
   - Modern React UI with Tailwind CSS
   - Link to OHIF viewer for study viewing

2. **Production Readiness**
   - Let's Encrypt TLS certificates
   - Firewall rules for DICOM port
   - Audit logging verification
   - Backup procedures
   - Monitoring and alerting

### Prerequisites
- ✅ Orthanc with DICOMweb
- ✅ PostgreSQL database
- ✅ nginx with TLS
- ✅ JWT-based authorization
- ✅ OHIF viewer
- ⏳ Next.js development environment

---

## Development Commands

### Start Services
```bash
# From project root
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
docker compose logs -f auth-service
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
- [x] Implement JWT-based authorization (Phase 3)
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

### ✅ Implemented (Phase 3)
- Role-based access control (admin, radiologist, viewer)
- JWT-based authentication with token revocation

### ⏳ Pending
- Audit logging verification
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

**Session Summary (Phase 4):** Integrated OHIF v3.10.2 DICOM viewer behind nginx at `/viewer/`. OHIF connects to Orthanc via dedicated proxy endpoints (`/ohif-dicom-web/`, `/ohif-wado`) with nginx-injected basic auth, keeping the viewer stateless. Webpack chunk loading handled by nginx catch-all. All 5 services (nginx, orthanc, postgres, auth-service, ohif) running on internal Docker network.
