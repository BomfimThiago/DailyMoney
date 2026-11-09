import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex h-5 flex-none items-center gap-1 whitespace-nowrap rounded-md px-1.5 text-[12px] font-medium [&_svg]:size-3 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-secondary text-muted-foreground",
        /** Entrada de dinheiro, sucesso, confirmado. */
        success: "bg-success-soft text-success",
        /** Pede ação: revisar, pendente. */
        warning: "bg-warning-soft text-warning",
        /** Só erros reais (falhou, inválido). */
        danger: "bg-destructive-soft text-destructive",
        /** Transferência interna, IA, informação. */
        info: "bg-transfer-soft text-transfer",
        outline: "border border-input text-muted-foreground",
        // Aliases legados usados pelas telas atuais.
        income: "bg-success-soft text-success",
        expense: "bg-secondary text-foreground",
        transfer: "bg-transfer-soft text-transfer",
        pending: "bg-warning-soft text-warning",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { badgeVariants };
