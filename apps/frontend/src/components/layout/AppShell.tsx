import { useState, useEffect } from "react";
import { Sidebar } from "./Sidebar";
import { MainPanel } from "./MainPanel";
import { ConnectionStatus } from "@/components/ui/ConnectionStatus";
import { useChatStore } from "@/stores/chatStore";
import { cn } from "@/lib/utils";

export function AppShell() {
  const [mobileView, setMobileView] = useState<"list" | "chat">("list");
  const activeConversationId = useChatStore((s) => s.activeConversationId);

  // When a conversation is selected on mobile, switch to chat view
  const handleConversationSelect = () => {
    if (activeConversationId) {
      setMobileView("chat");
    }
  };

  // Listen for activeConversationId changes
  useEffect(() => {
    const unsub = useChatStore.subscribe((state, prev) => {
      if (state.activeConversationId && state.activeConversationId !== prev.activeConversationId) {
        setMobileView("chat");
        // Clear unread badge immediately when opening a conversation
        useChatStore.getState().resetUnreadCount(state.activeConversationId);
      }
    });
    return unsub;
  }, []);

  const handleBack = () => {
    setMobileView("list");
  };

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-background">
      {/* Sidebar — always visible on md+, conditionally on mobile */}
      <div
        className={cn(
          "h-full shrink-0 border-r border-border",
          // Mobile: full width or hidden
          mobileView === "list" ? "w-full" : "hidden",
          // Tablet: 280px
          "md:block md:w-[280px]",
          // Desktop: 320px
          "lg:w-[320px]"
        )}
        onClick={handleConversationSelect}
      >
        <Sidebar />
      </div>

      {/* Main panel — always visible on md+, conditionally on mobile */}
      <div
        className={cn(
          "h-full min-w-0 flex-1",
          // Mobile: full width or hidden
          mobileView === "chat" ? "block" : "hidden",
          // Tablet+: always visible
          "md:block"
        )}
      >
        <MainPanel onBack={handleBack} />
      </div>

      {/* Connection status indicator */}
      <ConnectionStatus />
    </div>
  );
}
