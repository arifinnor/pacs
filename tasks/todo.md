# Phase 6: OHIF Viewer Authentication

## Problem
`/viewer/`, `/ohif-dicom-web/`, and `/ohif-wado` are unauthenticated.
Anyone with the URL can browse all patient DICOM studies without logging in.

## Root Cause
OHIF is a browser SPA — it cannot send `Authorization: Bearer` headers to nginx.
The existing `auth_request /_validate_jwt` only validates Bearer tokens, so it
cannot be used as-is for browser routes that carry auth in httpOnly cookies.

## Approach
Extend `GET /auth/validate` in the auth-service to accept `access_token` from
the Cookie header as a fallback (Bearer header takes priority). Then add
`auth_request` + login redirect to all OHIF-related nginx locations.

nginx sends the full original request headers (including `Cookie:`) in the
auth_request subrequest, so no structural changes to nginx are needed beyond
adding the directive and an error handler.

---

## Tasks

- [ ] 1. **auth-service** — extend `GET /validate` to accept cookie fallback
  - File: `auth-service/src/routes/auth.ts`
  - Logic: if `Authorization` header is absent or empty, read `access_token`
    from the `Cookie` header instead
  - Same validation path after token is extracted (decode + DB session check)

- [ ] 2. **nginx** — gate OHIF locations with `auth_request`
  - File: `Orthanc/nginx/nginx.conf`
  - Add `auth_request /_validate_jwt;` to:
    - `location /viewer/`
    - `location /ohif-dicom-web/`
    - `location /ohif-wado`
  - Add a `location @viewer_auth_error` handler that returns `302` to
    `/app/login` (browser redirect, not a JSON error like the existing
    `@auth_error` handler which is for API clients)
  - Wire `error_page 401 = @viewer_auth_error;` **inside** each viewer
    location block (or as a scoped override) so only these locations redirect
    to login; API locations keep the JSON 401

- [ ] 3. **Rebuild & verify**
  - `docker compose up -d --build auth-service` then `nginx -s reload` (or
    full rebuild)
  - Clear cookies → visit `https://localhost/viewer/` → should redirect to login
  - Log in → visit OHIF link → opens viewer ✓
  - `/ohif-dicom-web/studies` without cookie → 302 to `/app/login` ✓

---

## Constraints
- Do NOT add `auth_request` to `/_validate_jwt` itself (internal location)
- Do NOT break the existing `@auth_error` JSON handler used by `/orthanc/`,
  `/dicom-web/`, `/wado` — those are API routes, not browser routes
- Cookie name must match exactly: `access_token` (set by `web/lib/auth.ts`)
- Cookie path is `/app` — it IS sent for `/viewer/` requests because the
  cookie `path` attribute only restricts when the browser sends the cookie for
  paths under `/app`. Wait — actually `path=/app` means the browser ONLY sends
  the cookie for paths starting with `/app`. `/viewer/` does NOT start with
  `/app`, so the cookie will NOT be sent for OHIF requests.

## Revised Approach (cookie path issue)
The `access_token` cookie has `path: "/app"` (set in `web/lib/auth.ts`).
Browsers only send cookies whose `path` attribute is a prefix of the request
URL. `/viewer/` does not start with `/app`, so the access_token cookie is
**not sent** to the OHIF endpoints.

Two options:
  A. Change cookie path to `/` so it's sent everywhere
  B. Add a dedicated nginx subrequest endpoint that the browser hits first,
     validates the cookie, then sets a session or passes the check

**Option A is simpler and correct here**: cookies with `path=/` are sent for
all paths on the domain. The `httpOnly` + `secure` + `sameSite=strict`
attributes still protect the cookie from XSS and CSRF. Change path from
`"/app"` to `"/"` in `web/lib/auth.ts`.

## Final Task List (revised)

- [ ] 1. **web/lib/auth.ts** — change `COOKIE_OPTIONS.path` from `"/app"` to `"/"`
  - This makes `access_token` and `refresh_token` cookies sent for ALL paths
    including `/viewer/`, enabling nginx auth_request to read them

- [ ] 2. **auth-service/src/routes/auth.ts** — extend `GET /validate` cookie fallback
  - If `Authorization` header missing, parse `access_token` from `Cookie` header
  - Same validation logic after token is extracted

- [ ] 3. **nginx** — add `auth_request` + redirect to OHIF locations
  - Add `location @viewer_auth_error { return 302 /app/login; }`
  - In `location /viewer/`, `location /ohif-dicom-web/`, `location /ohif-wado`:
    add `auth_request /_validate_jwt;` and `error_page 401 = @viewer_auth_error;`

- [ ] 4. **Rebuild & verify**
