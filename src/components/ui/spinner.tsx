import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function Spinner({ className }: { className?: string }) {
  return <Loader2 aria-hidden className={cn("h-5 w-5 animate-spin text-muted-foreground", className)} />;
}

// Full-area centered loading state.
export function LoadingState({ label = "Carregando…" }: { label?: string }) {
  return (
    <div role="status" className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
      <Spinner className="h-6 w-6" />
      <span className="text-sm">{label}</span>
    </div>
  );
}
