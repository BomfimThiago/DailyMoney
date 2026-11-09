import { cn } from "@/lib/utils";

/** Placeholder de carregamento com o formato do conteúdo final. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-md bg-secondary", className)} />;
}
