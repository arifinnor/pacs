"use client";

import { useAuth } from "@/hooks/use-auth";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";

export default function ProfilePage() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner />
      </div>
    );
  }

  if (!user) {
    return (
      <p className="text-muted-foreground text-center py-12">
        Not authenticated
      </p>
    );
  }

  return (
    <div className="max-w-lg">
      <h2 className="text-xl font-semibold text-foreground mb-6">Profile</h2>

      <Card>
        <CardHeader>
          <CardTitle>Account Information</CardTitle>
        </CardHeader>
        <div className="flex flex-col gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">Username</p>
            <p className="font-medium text-foreground">{user.username}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Email</p>
            <p className="font-medium text-foreground">{user.email}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Role</p>
            <Badge variant={user.role}>{user.role}</Badge>
          </div>
          <div>
            <p className="text-muted-foreground">Account Created</p>
            <p className="font-medium text-foreground">
              {new Date(user.created_at).toLocaleDateString()}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Last Login</p>
            <p className="font-medium text-foreground">
              {user.last_login
                ? new Date(user.last_login).toLocaleString()
                : "Never"}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Status</p>
            <Badge variant={user.is_active ? "viewer" : "muted"}>
              {user.is_active ? "Active" : "Inactive"}
            </Badge>
          </div>
        </div>
      </Card>
    </div>
  );
}
