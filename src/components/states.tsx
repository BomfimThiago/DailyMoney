import * as React from "react";
import { AlertTriangle, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";

// Estados obrigatórios de toda chamada async: carregando (LoadingState/Skeleton),
// erro (ErrorState — erros sempre evidentes) e vazio (EmptyState).

export function ErrorState({
  error,
  onRetry,
  title = "Não deu para carregar",
}: {
  error: unknown;
  onRetry?: () => void;
  title?: string;
}) {
  const message = error instanceof Error ? error.message : "Algo deu errado";
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center gap-3 rounded-2xl bg-destructive-soft/50 px-6 py-12 text-center"
    >
      <span className="grid size-10 place-items-center rounded-lg bg-field text-destructive shadow-control">
        <AlertTriangle aria-hidden className="size-5" />
      </span>
      <div className="space-y-1">
        <p className="font-display text-display-sm">{title}</p>
        <p className="max-w-md text-[13.5px] text-muted-foreground">{message}</p>
      </div>
      {onRetry ? (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Tentar novamente
        </Button>
      ) : null}
    </div>
  );
}

export function EmptyState({
  title,
  hint,
  action,
  icon,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl bg-muted px-6 py-12 text-center">
      <span className="grid size-10 place-items-center rounded-lg bg-field text-muted-foreground shadow-control [&_svg]:size-5">
        {icon ?? <Inbox />}
      </span>
      <div className="space-y-1">
        <p className="font-display text-display-sm">{title}</p>
        {hint ? <p className="max-w-md text-[13.5px] text-muted-foreground">{hint}</p> : null}
      </div>
      {action}
    </div>
  );
}
