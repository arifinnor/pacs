# PACS Project — Progress

## Completed Phases

### Phase 1–4: Infrastructure ✅
- Orthanc DICOM server + PostgreSQL index
- DICOMweb (QIDO-RS, WADO-RS, STOW-RS)
- nginx reverse proxy with TLS termination
- OHIF v3.10.2 viewer at `/viewer/`
- JWT auth service (Fastify/Node.js) with httpOnly cookies

### Phase 5: Next.js Radiologist Dashboard ✅ `ed0ad4d`
- Next.js 16.2.1 with App Router, `basePath: '/app'`, standalone Docker output
- proxy.ts middleware: guards all routes, uses `X-Forwarded-Proto` for HTTPS redirects
- `request.nextUrl.pathname` has basePath stripped — checks use `/login` not `/app/login`
- All `next/link` hrefs and `router.push()` / `redirect()` use paths WITHOUT `/app/` prefix (basePath auto-prepended)
- Auth flow: httpOnly cookies (`access_token` 15min, `refresh_token` 7 days), path `/`
- Auto-refresh on 401 in `AuthProvider.fetchUser()`
- DICOMweb proxy routes inject Orthanc Basic auth server-side
- Pages: login, worklist (search/filter), study detail + series list, profile
- OHIF links use correct route: `/viewer/viewer?StudyInstanceUIDs=<UID>`

### Phase 6: OHIF Viewer Authentication ✅ `c0ee085`
- Problem: `/viewer/`, `/ohif-dicom-web/`, `/ohif-wado` were unauthenticated
- Auth cookie path changed from `/app` to `/` — cookies now sent for all paths
- `GET /auth/validate` extended to accept `access_token` from Cookie header
  (Bearer header takes priority; cookie fallback for browser SPA routes)
- nginx `auth_request /_validate_jwt` added to all three OHIF locations
- `@viewer_auth_error` → `302 /app/login` (distinct from JSON 401 for API routes)

---

## Security Model (current)

| Route | Auth Method | Unauth Behaviour |
|-------|------------|-----------------|
| `/app/` | Next.js proxy.ts (cookie check) | 307 → `/app/login` |
| `/orthanc/` | nginx auth_request (Bearer) | JSON 401 |
| `/dicom-web/` | nginx auth_request (Bearer) | JSON 401 |
| `/wado` | nginx auth_request (Bearer) | JSON 401 |
| `/viewer/` | nginx auth_request (cookie) | 302 → `/app/login` |
| `/ohif-dicom-web/` | nginx auth_request (cookie) | 302 → `/app/login` |
| `/ohif-wado` | nginx auth_request (cookie) | 302 → `/app/login` |
| `/auth/` | none (public) | — |

---

## Potential Next Steps
- Production hardening: real TLS certs (Let's Encrypt), strong `.env` secrets
- User management UI (admin: create/disable accounts)
- Audit log viewer in dashboard
- C-STORE modality testing with real equipment
- Load testing (50+ concurrent DICOM uploads)
- PMK 24/2022 compliance checklist sign-off
