import { useSocketStore } from "@/stores/socketStore";
import { Loader2, WifiOff, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getSocket } from "@/lib/socket";
import { cn } from "@/lib/utils";

export function ConnectionStatus() {
  const isConnected = useSocketStore((s) => s.isConnected);
  const isConnecting = useSocketStore((s) => s.isConnecting);

  if (isConnected) return null;

  const handleReconnect = () => {
    const socket = getSocket();
    if (socket && !socket.connected) {
      socket.connect();
    }
  };

  return (
    <div
      className={cn(
        "fixed bottom-4 left-1/2 z-50 -translate-x-1/2",
        "flex items-center gap-2 rounded-full px-4 py-2 shadow-lg",
        "transition-all duration-300 animate-in fade-in slide-in-from-bottom-2",
        isConnecting
          ? "bg-yellow-500/90 text-yellow-950"
          : "bg-destructive/90 text-destructive-foreground"
      )}
    >
      {isConnecting ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm font-medium">Reconnecting...</span>
        </>
      ) : (
        <>
          <WifiOff className="h-4 w-4" />
          <span className="text-sm font-medium">No connection</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 rounded-full px-2 text-xs hover:bg-white/20"
            onClick={handleReconnect}
          >
            <RefreshCw className="mr-1 h-3 w-3" />
            Retry
          </Button>
        </>
      )}
    </div>
  );
}
