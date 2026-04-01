"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import { ApiClient } from "./api";

interface AuthContextType {
  api: ApiClient;
  isLoggedIn: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [api] = useState(() => new ApiClient());
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem("cf_token");
    if (saved) {
      api.token = saved;
      api
        .getUser()
        .then(() => setIsLoggedIn(true))
        .catch(() => {
          api.token = null;
          localStorage.removeItem("cf_token");
        })
        .finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, [api]);

  const login = useCallback(
    async (email: string, password: string) => {
      const token = await api.login(email, password);
      localStorage.setItem("cf_token", token);
      await api.getUser();
      setIsLoggedIn(true);
    },
    [api]
  );

  const logout = useCallback(() => {
    localStorage.removeItem("cf_token");
    api.token = null;
    api.userInfo = null;
    setIsLoggedIn(false);
  }, [api]);

  return (
    <AuthContext.Provider value={{ api, isLoggedIn, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
