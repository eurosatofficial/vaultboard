import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, jsonBody, setCsrfToken } from "../lib/api";
import type { User } from "../types";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  registrationOpen: boolean | null;
  login: (email: string, password: string) => Promise<void>;
  register: (input: { email: string; displayName: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (user: User) => void;
  refreshRegistration: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [registrationOpen, setRegistrationOpen] = useState<boolean | null>(null);

  const refreshRegistration = async () => {
    const status = await api<{ registrationOpen: boolean }>("/api/auth/status");
    setRegistrationOpen(status.registrationOpen);
  };

  useEffect(() => {
    void (async () => {
      const [account, status] = await Promise.allSettled([
        api<{ user: User; csrfToken: string }>("/api/auth/me"),
        api<{ registrationOpen: boolean }>("/api/auth/status"),
      ]);
      if (account.status === "fulfilled") {
        setUser(account.value.user);
        setCsrfToken(account.value.csrfToken);
      }
      if (status.status === "fulfilled") setRegistrationOpen(status.value.registrationOpen);
      setLoading(false);
    })();
  }, []);

  const login = async (email: string, password: string) => {
    const result = await api<{ user: User; csrfToken: string }>("/api/auth/login", {
      method: "POST",
      body: jsonBody({ email, password }),
    });
    setCsrfToken(result.csrfToken);
    setUser(result.user);
  };

  const register = async (input: { email: string; displayName: string; password: string }) => {
    const result = await api<{ user: User; csrfToken: string }>("/api/auth/register", {
      method: "POST",
      body: jsonBody(input),
    });
    setCsrfToken(result.csrfToken);
    setUser(result.user);
    setRegistrationOpen(false);
  };

  const logout = async () => {
    await api<void>("/api/auth/logout", { method: "POST" });
    setCsrfToken("");
    setUser(null);
  };

  const value = useMemo(
    () => ({ user, loading, registrationOpen, login, register, logout, updateUser: setUser, refreshRegistration }),
    [user, loading, registrationOpen],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
