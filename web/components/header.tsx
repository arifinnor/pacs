"use client";

import { useAuth } from "@/hooks/use-auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function Header() {
  const { user, logout } = useAuth();

  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-card px-6">
      <h1 className="text-sm font-medium text-muted-foreground">
        Radiologist Dashboard
      </h1>
      <div className="flex items-center gap-4">
        {user && (
          <>
            <span className="text-sm text-foreground">{user.username}</span>
            <Badge variant={user.role}>{user.role}</Badge>
            <Button variant="ghost" size="sm" onClick={logout}>
              Logout
            </Button>
          </>
        )}
      </div>
    </header>
  );
}
