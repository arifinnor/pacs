const AUTH_SERVICE_URL =
  process.env.AUTH_SERVICE_URL ?? "http://auth-service:8000";

export interface AuditEvent {
  userId: string;
  userRole?: string;
  action: string;
  resourceType?: string;
  resourceId?: string;
  patientId?: string;
  ipAddress?: string;
  success: boolean;
  details?: string;
}

export function logAudit(event: AuditEvent): void {
  fetch(`${AUTH_SERVICE_URL}/internal/audit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(event),
  }).catch(() => {
    // Never block the main request — silently drop audit failures
  });
}
