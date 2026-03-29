"use client";

import { useAuth } from "@/hooks/use-auth";

interface RoleGateProps {
  allowedRoles: Array<"admin" | "radiologist" | "viewer">;
  children: React.ReactNode;
}

export function RoleGate({ allowedRoles, children }: RoleGateProps) {
  const { user } = useAuth();
  if (!user || !allowedRoles.includes(user.role)) return null;
  return <>{children}</>;
}
