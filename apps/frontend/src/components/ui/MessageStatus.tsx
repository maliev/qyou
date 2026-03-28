import { Check, CheckCheck, Loader2, AlertCircle } from "lucide-react";
import { MessageDeliveryStatus } from "@/types";
import { cn } from "@/lib/utils";

export function MessageStatus({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  if (status === "failed") {
    return <AlertCircle className={cn("h-4 w-4 text-destructive", className)} />;
  }
  if (status === "pending") {
    return <Loader2 className={cn("h-4 w-4 animate-spin text-muted-foreground", className)} />;
  }
  if (status === MessageDeliveryStatus.Read) {
    return <CheckCheck className={cn("h-4 w-4 text-violet-400", className)} />;
  }
  if (status === MessageDeliveryStatus.Delivered) {
    return <CheckCheck className={cn("h-4 w-4 text-muted-foreground", className)} />;
  }
  return <Check className={cn("h-4 w-4 text-muted-foreground", className)} />;
}
