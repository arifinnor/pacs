"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";

interface AuthUser {
  id: string;
  username: string;
  email: string;
  role: "admin" | "radiologist" | "viewer";
  is_active: boolean;
  created_at: string;
  last_login: string | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  const fetchUser = useCallback(async () => {
    try {
      const res = await fetch("/app/api/auth/me");
      if (res.ok) {
        const data = await res.json();
        setUser(data);
        return;
      }
      // Access token expired — try refresh once
      if (res.status === 401) {
        const refreshRes = await fetch("/app/api/auth/refresh", { method: "POST" });
        if (refreshRes.ok) {
          const retryRes = await fetch("/app/api/auth/me");
          if (retryRes.ok) {
            setUser(await retryRes.json());
            return;
          }
        }
      }
      setUser(null);
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  const login = useCallback(
    async (username: string, password: string) => {
      const res = await fetch("/app/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Login failed");
      }

      await fetchUser();
      router.push("/worklist");
    },
    [fetchUser, router]
  );

  const refresh = useCallback(async () => {
    const res = await fetch("/app/api/auth/refresh", { method: "POST" });
    if (res.ok) {
      await fetchUser();
      return true;
    }
    setUser(null);
    return false;
  }, [fetchUser]);

  const logout = useCallback(async () => {
    await fetch("/app/api/auth/logout", { method: "POST" });
    setUser(null);
    router.push("/login");
  }, [router]);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}
