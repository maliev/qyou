import { ArrowLeft, Settings } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { TwoFactorSetup } from "@/components/settings/TwoFactorSetup";
import { BlockedUsers } from "@/components/settings/BlockedUsers";
import { useAuthStore } from "@/stores/authStore";
import { useAuth } from "@/hooks/useAuth";
import { useCallback, useEffect, useState } from "react";
import api from "@/lib/api";

export function SettingsPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const setAuth = useAuthStore((s) => s.setAuth);
  const { logout } = useAuth();
  const [totpEnabled, setTotpEnabled] = useState(user?.totp_enabled ?? false);

  const refreshUser = useCallback(async () => {
    try {
      const { data } = await api.get("/auth/me");
      const stored = useAuthStore.getState();
      if (stored.accessToken && stored.refreshToken) {
        setAuth(data.user, stored.accessToken, stored.refreshToken);
      }
      setTotpEnabled(data.user.totp_enabled ?? false);
    } catch {
      // ignore
    }
  }, [setAuth]);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  if (!user) return null;

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b">
        <Button
          variant="ghost"
          size="icon"
          className="min-h-[44px] min-w-[44px]"
          onClick={() => navigate("/")}
          aria-label="Back"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <Settings className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-lg font-semibold">Settings</h1>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-lg space-y-6 p-4">
          {/* Profile section */}
          <section className="space-y-4">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Profile
            </h2>
            <div className="flex items-center gap-4">
              <UserAvatar
                src={user.avatar_url}
                displayName={user.display_name}
                username={user.username}
                size="lg"
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">
                  {user.display_name || user.username}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  @{user.username}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {user.email}
                </p>
              </div>
            </div>
          </section>

          <Separator />

          {/* Security section */}
          <section className="space-y-4">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Security
            </h2>
            <TwoFactorSetup
              enabled={totpEnabled}
              onStatusChange={refreshUser}
            />
          </section>

          <Separator />

          {/* Blocked Users section */}
          <section className="space-y-4">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Blocked Users
            </h2>
            <BlockedUsers />
          </section>

          <Separator />

          {/* Account section */}
          <section className="space-y-4">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Account
            </h2>
            <Button variant="destructive" size="sm" onClick={logout}>
              Log out
            </Button>
          </section>
        </div>
      </div>
    </div>
  );
}
