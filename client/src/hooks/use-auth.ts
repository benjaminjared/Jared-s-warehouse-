import { useState, useCallback, useEffect } from "react";
import type { UserProfile } from "@shared/schema";

export interface AuthState {
  token: string;
  profile: UserProfile;
}

const AUTH_KEY = "wh3_auth";

function loadStored(): AuthState | null {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function persist(auth: AuthState | null) {
  if (auth) localStorage.setItem(AUTH_KEY, JSON.stringify(auth));
  else localStorage.removeItem(AUTH_KEY);
}

export function useAuth() {
  const [auth, setAuthRaw] = useState<AuthState | null>(loadStored);

  const setAuth = useCallback((next: AuthState | null) => {
    persist(next);
    setAuthRaw(next);
  }, []);

  const updateProfile = useCallback((profile: UserProfile) => {
    setAuthRaw(prev => {
      if (!prev) return null;
      const next = { ...prev, profile };
      persist(next);
      return next;
    });
  }, []);

  const register = async (username: string, password: string): Promise<void> => {
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Registration failed");
    setAuth({ token: data.token, profile: data.profile });
  };

  const login = async (username: string, password: string): Promise<void> => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Login failed");
    setAuth({ token: data.token, profile: data.profile });
  };

  const logout = useCallback(async () => {
    if (auth?.token) {
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: { Authorization: `Bearer ${auth.token}` },
      }).catch(() => {});
    }
    setAuth(null);
  }, [auth, setAuth]);

  const refreshProfile = useCallback(async () => {
    if (!auth?.token) return;
    try {
      const res = await fetch("/api/auth/me", { headers: { Authorization: `Bearer ${auth.token}` } });
      if (res.ok) { const data = await res.json(); updateProfile(data.profile); }
      else if (res.status === 401) { setAuth(null); } // token expired / invalid
    } catch {}
  }, [auth, updateProfile, setAuth]);

  // Auto-refresh from server on every app load so all devices see the same data
  useEffect(() => {
    refreshProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { auth, login, register, logout, updateProfile, refreshProfile };
}
