# 09 — PMK 24/2022 Compliance

> **Disclaimer**: This document provides technical implementation guidance, not legal advice. Engage a healthcare compliance consultant to formally sign off on regulatory requirements before go-live with patient data.

## What PMK 24/2022 requires (technical summary)

PMK 24/2022 (Peraturan Menteri Kesehatan No. 24 Tahun 2022) on Electronic Medical Records requires:

| Requirement | Category |
|-------------|----------|
| Data stored on servers located in Indonesia | Data residency |
| Electronic medical records must not be altered without logging | Data integrity |
| Access must be restricted and traceable to individual users | Access control & audit |
| System must have backup and recovery capability | Business continuity |
| Patient data must be protected from unauthorized access | Security |
| Data retention minimum 25 years for adults, until age 27+5 for minors | Retention |

---

## Technical compliance checklist

### Data residency
- [ ] Server is physically located in Indonesia (data center, hospital premises, or Indonesian cloud region)
- [ ] If using cloud: AWS Jakarta (ap-southeast-3), GCP Jakarta (asia-southeast2), or local provider
- [ ] Document server location — you may need to provide this to the hospital and regulator
- [ ] If using CDN for OHIF static assets: ensure CDN config does NOT cache DICOM data (only JS/CSS assets)

### Access control
- [ ] Every user accessing the system has a unique credential (no shared logins)
- [ ] Role-based access implemented (radiologist, clinician, admin roles)
- [ ] DICOM modalities authenticated by AE Title (see `02-orthanc-config.md`)
- [ ] JWT tokens expire (recommended: 8 hours max session, 30 minutes inactivity timeout)
- [ ] Password policy: minimum length, complexity, expiry enforced
- [ ] Admin accounts logged separately

### Audit trail
- [ ] Every login/logout event logged with timestamp and user identity
- [ ] Every study access (view, download) logged
- [ ] Every study modification logged
- [ ] Every C-STORE (modality sends image) logged
- [ ] Logs include: timestamp, user/AE, action, resource (patient ID, study UID)
- [ ] Logs are stored separately from application data (cannot be deleted by app users)
- [ ] Log retention: minimum 5 years recommended (check with compliance counsel)

### Data integrity
- [ ] DICOM files are stored without modification after receipt
- [ ] Any modifications (anonymization, report attachment) create new instances with new UIDs — original preserved
- [ ] PostgreSQL write-ahead log (WAL) enabled (default in PostgreSQL)
- [ ] File checksums logged (Orthanc does this — verify `AttachedFiles` table has MD5 column populated)

### Backup & recovery
- [ ] Daily automated backup of PostgreSQL
- [ ] Daily or continuous backup of DICOM storage
- [ ] Backup tested by restoring to a separate environment (minimum annually)
- [ ] Recovery time objective (RTO) documented
- [ ] Recovery point objective (RPO) documented
- [ ] Backup storage is also in Indonesia

### Security
- [ ] TLS 1.2 minimum on all external connections (nginx config enforces this)
- [ ] No patient data transmitted over HTTP
- [ ] Penetration test or security review before go-live (recommended)
- [ ] Vulnerability disclosure / update process documented

### Data retention
- [ ] Orthanc MaximumStorageSize set to 0 (unlimited) OR storage plan accounts for 25-year retention
- [ ] No automated deletion of patient records without explicit clinical authorization
- [ ] Deletion events logged if deletion is permitted

---

## Audit logging implementation

### What to log (minimum)

```typescript
// lib/audit/log.ts

export interface AuditEvent {
  timestamp: string        // ISO 8601
  userId: string           // unique user identifier
  userRole: string         // radiologist, clinician, admin
  action: string           // VIEW_STUDY, DOWNLOAD_IMAGE, LOGIN, LOGOUT, C_STORE_RECEIVED
  resourceType: string     // STUDY, SERIES, INSTANCE, SESSION
  resourceId: string       // StudyInstanceUID or session ID
  patientId?: string       // PatientID (not PatientName for privacy in log transport)
  ipAddress: string        // client IP
  success: boolean
  details?: string         // error message or additional context
}

export async function logAuditEvent(event: AuditEvent) {
  // Write to persistent audit log
  // Option A: append to structured log file
  const logLine = JSON.stringify({ ...event, timestamp: new Date().toISOString() })
  // fs.appendFileSync('/var/log/pacs/audit.log', logLine + '\n')

  // Option B: write to audit table in PostgreSQL
  // await db.query('INSERT INTO audit_log (...) VALUES (...)', [...])

  // Option C: ship to external log service
  // await fetch('http://log-service/audit', { method: 'POST', body: logLine })
}
```

### Audit events to capture in Next.js

```typescript
// In your API routes, log every access:

// Study view
await logAuditEvent({
  userId: session.user.id,
  userRole: session.user.role,
  action: 'VIEW_STUDY',
  resourceType: 'STUDY',
  resourceId: studyUID,
  patientId: patientId,
  ipAddress: req.headers.get('x-forwarded-for') || 'unknown',
  success: true,
})

// Login
await logAuditEvent({
  userId: user.id,
  userRole: user.role,
  action: 'LOGIN',
  resourceType: 'SESSION',
  resourceId: sessionId,
  ipAddress: req.headers.get('x-forwarded-for') || 'unknown',
  success: true,
})
```

---

## Audit log PostgreSQL table

```sql
CREATE TABLE audit_log (
  id          BIGSERIAL PRIMARY KEY,
  timestamp   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id     VARCHAR(255) NOT NULL,
  user_role   VARCHAR(100),
  action      VARCHAR(100) NOT NULL,
  resource_type VARCHAR(100),
  resource_id VARCHAR(255),
  patient_id  VARCHAR(255),
  ip_address  VARCHAR(45),
  success     BOOLEAN NOT NULL DEFAULT TRUE,
  details     TEXT
);

CREATE INDEX idx_audit_timestamp ON audit_log (timestamp);
CREATE INDEX idx_audit_user_id ON audit_log (user_id);
CREATE INDEX idx_audit_patient_id ON audit_log (patient_id);

-- Prevent application user from deleting audit records
REVOKE DELETE ON audit_log FROM orthanc_app_user;
```

---

## Data residency verification

If hosting on a cloud provider:
```bash
# Verify your server's region
curl https://checkip.amazonaws.com  # get your IP
# Then check IP geolocation — must resolve to Indonesia
```

Document this for your compliance record:
- Cloud provider name
- Region/availability zone name
- Data center location (city)
- Date verified

---

## Compliance documentation to prepare

Before go-live, prepare and file:

1. **System description document** — what the system is, who uses it, what data it stores
2. **Data flow diagram** — where data enters, is stored, and is accessed
3. **Security policy** — who has admin access, password policy, incident response
4. **Backup and recovery plan** — with tested RTO/RPO figures
5. **User access register** — list of all users with roles
6. **Vendor information** — Orthanc (open source, UCLouvain), PostgreSQL (open source)

---

## Done when
- [ ] Server confirmed located in Indonesia
- [ ] Audit logging writing events for login, study view, C-STORE received
- [ ] Audit log cannot be deleted by normal app users
- [ ] Backup tested with actual restore
- [ ] TLS verified with `curl -I https://your-domain.com`
- [ ] No HTTP access to patient data (all redirects to HTTPS)
- [ ] Role-based access working (radiologist cannot access admin endpoints)
- [ ] Compliance documentation drafted
