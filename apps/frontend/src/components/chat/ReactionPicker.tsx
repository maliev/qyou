import { useRef, useEffect } from "react";
import { cn } from "@/lib/utils";

const REACTIONS = ["❤️", "🔥", "😂", "👍", "👎", "😮"];

export function ReactionPicker({
  onSelect,
  className,
}: {
  onSelect: (emoji: string) => void;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // Clamp horizontal position so the picker stays within the viewport
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.left < 8) {
      el.style.transform = `translateX(${8 - rect.left}px)`;
    } else if (rect.right > window.innerWidth - 8) {
      el.style.transform = `translateX(${window.innerWidth - 8 - rect.right}px)`;
    }
  }, []);

  return (
    <div
      ref={ref}
      className={cn(
        "flex items-center gap-1 rounded-lg bg-popover border border-border p-1 shadow-md",
        className
      )}
    >
      {REACTIONS.map((emoji) => (
        <button
          key={emoji}
          onClick={() => onSelect(emoji)}
          className="h-8 w-8 flex items-center justify-center rounded-md hover:bg-accent text-base transition-colors"
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}
