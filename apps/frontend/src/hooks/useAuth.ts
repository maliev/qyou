import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { queryClient } from "@/lib/queryClient";
import { clearAll as clearE2EEKeys } from "@/lib/e2ee/keyStore";
import type { LoginResponse } from "@/types";
import axios from "axios";

export function useAuth() {
  const { setAuth, logout: storeLogout, refreshToken } = useAuthStore();
  const navigate = useNavigate();

  const login = async (
    loginStr: string,
    password: string
  ): Promise<LoginResponse | null> => {
    const { data } = await api.post<LoginResponse>("/auth/login", {
      login: loginStr,
      password,
    });

    if (data.requires2FA) {
      // Don't set auth yet — need 2FA verification
      return data;
    }

    if (data.user && data.accessToken && data.refreshToken) {
      setAuth(data.user, data.accessToken, data.refreshToken);
    }
    return null;
  };

  const validate2FA = async (
    userId: string,
    token: string,
    tempToken: string
  ) => {
    const { data } = await axios.post(
      `${import.meta.env.VITE_API_URL}/auth/2fa/validate`,
      { userId, token },
      { headers: { Authorization: `Bearer ${tempToken}` } }
    );
    setAuth(data.user, data.accessToken, data.refreshToken);
    return data;
  };

  const register = async (input: {
    username: string;
    email: string;
    password: string;
    display_name?: string;
  }) => {
    const { data } = await api.post("/auth/register", input);
    setAuth(data.user, data.accessToken, data.refreshToken);
    return data.user;
  };

  const logout = async () => {
    try {
      if (refreshToken) {
        await api.post("/auth/logout", { refreshToken });
      }
    } catch {
      // ignore logout API errors
    }
    // Clear E2EE keys from IndexedDB
    try {
      await clearE2EEKeys();
    } catch {
      // ignore — keys may not exist yet
    }
    storeLogout();
    queryClient.clear();
    navigate("/auth");
  };

  return { login, register, logout, validate2FA };
}
