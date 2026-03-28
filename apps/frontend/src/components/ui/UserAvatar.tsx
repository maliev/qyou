import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { PresenceDot } from "./PresenceDot";
import { cn } from "@/lib/utils";

const avatarSizes = {
  sm: "h-8 w-8",
  md: "h-10 w-10",
  lg: "h-12 w-12",
};

function getInitials(name: string | null, username: string): string {
  if (name) {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  }
  return username.slice(0, 2).toUpperCase();
}

export function UserAvatar({
  src,
  displayName,
  username,
  size = "md",
  showPresence,
  presenceStatus,
  className,
}: {
  src?: string | null;
  displayName?: string | null;
  username: string;
  size?: "sm" | "md" | "lg";
  showPresence?: boolean;
  presenceStatus?: "online" | "offline";
  className?: string;
}) {
  return (
    <div className={cn("relative inline-flex shrink-0", className)}>
      <Avatar className={cn(avatarSizes[size])}>
        {src && <AvatarImage src={src} alt={displayName || username} />}
        <AvatarFallback className="text-xs font-medium">
          {getInitials(displayName ?? null, username)}
        </AvatarFallback>
      </Avatar>
      {showPresence && presenceStatus && (
        <PresenceDot
          status={presenceStatus}
          size="sm"
          className="absolute bottom-0 right-0"
        />
      )}
    </div>
  );
}
