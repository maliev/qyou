import { cn } from "@/lib/utils";

const sizes = {
  sm: "h-2 w-2",
  md: "h-2.5 w-2.5",
  lg: "h-3 w-3",
};

export function PresenceDot({
  status,
  size = "md",
  className,
}: {
  status: "online" | "offline";
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "rounded-full border-2 border-background block",
        sizes[size],
        status === "online" ? "bg-green-500" : "bg-muted-foreground/40",
        className
      )}
    />
  );
}
