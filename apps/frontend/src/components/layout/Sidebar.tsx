import { useAuthStore } from "@/stores/authStore";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { ContactList } from "@/components/contacts/ContactList";
import { GlobalSearch } from "@/components/search/GlobalSearch";
import { Separator } from "@/components/ui/separator";
import { LogOut, Settings } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

export function Sidebar() {
  const user = useAuthStore((s) => s.user);
  const { logout } = useAuth();
  const navigate = useNavigate();

  if (!user) return null;

  return (
    <div className="flex h-full flex-col bg-card">
      {/* Header */}
      <div className="flex items-center gap-3 p-4">
        <UserAvatar
          src={user.avatar_url}
          displayName={user.display_name}
          username={user.username}
          size="md"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">
            {user.display_name || user.username}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            @{user.username}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="min-h-[44px] min-w-[44px] shrink-0"
          onClick={() => navigate("/settings")}
          aria-label="Settings"
        >
          <Settings className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="min-h-[44px] min-w-[44px] shrink-0"
          onClick={logout}
          aria-label="Log out"
        >
          <LogOut className="h-4 w-4" />
        </Button>
      </div>

      <Separator />

      {/* Search */}
      <div className="p-3">
        <GlobalSearch />
      </div>

      <Separator />

      {/* Contact / Conversation list */}
      <div className="flex-1 overflow-hidden">
        <ContactList />
      </div>
    </div>
  );
}
