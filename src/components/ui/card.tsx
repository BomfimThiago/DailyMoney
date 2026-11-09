import * as React from "react";
import { cn } from "@/lib/utils";

/** Superfície principal: branca sobre o chão cinza, 1px de borda, raio 20, sem sombra. */
export const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("rounded-card border border-card-border bg-card text-card-foreground", className)}
      {...props}
    />
  ),
);
Card.displayName = "Card";

/** Cabeçalho com título à esquerda e ação opcional à direita. */
export function CardHeader({
  className,
  action,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { action?: React.ReactNode }) {
  return (
    <div className={cn("flex items-start justify-between gap-3 px-6 pt-6", className)} {...props}>
      <div className="min-w-0 space-y-1">{children}</div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/** Título do cartão. h2 por padrão (logo abaixo do h1 da tela); `as="h3"` dentro de uma seção que já tem h2. */
export const CardTitle = ({
  className,
  as: Tag = "h2",
  ...props
}: React.HTMLAttributes<HTMLHeadingElement> & { as?: "h2" | "h3" }) => (
  <Tag
    className={cn("text-display-sm font-normal leading-7 tracking-[-0.01em] text-foreground", className)}
    {...props}
  />
);

export const CardDescription = ({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) => (
  <p className={cn("text-meta text-subtle", className)} {...props} />
);

export const CardContent = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("px-6 pb-6 pt-4", className)} {...props} />
);

export const CardFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex items-center gap-2 border-t px-6 py-4", className)} {...props} />
);
