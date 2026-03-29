import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { queryClient } from "@/lib/queryClient";
import { clearAll as clearE2EEKeys } from "@/lib/e2ee/keyStore";

export function useAuth() {
  const { setAuth, logout: storeLogout, refreshToken } = useAuthStore();
  const navigate = useNavigate();

  const login = async (login: string, password: string) => {
    const { data } = await api.post("/auth/login", { login, password });
    setAuth(data.user, data.accessToken, data.refreshToken);
    return data.user;
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

  return { login, register, logout };
}
