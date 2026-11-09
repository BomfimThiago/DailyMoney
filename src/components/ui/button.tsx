import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-[14px] font-semibold transition-[background,box-shadow,color,transform] duration-150 ease-out active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        /** Ação principal da tela. No máximo 1 por área. */
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        /** Ação secundária: branco flutuando com sombra de controle. */
        secondary: "bg-field text-foreground shadow-control hover:bg-secondary",
        /** Alias de `secondary` (compatibilidade com telas antigas). */
        outline: "bg-field text-foreground shadow-control hover:bg-secondary",
        /** Ação terciária, sem peso visual. */
        ghost: "text-muted-foreground hover:bg-secondary hover:text-foreground",
        /** Excluir, descartar dados. Sempre pedir confirmação. */
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        /** Sobre fundo escuro (barra de confirmação). */
        inverse: "bg-field text-foreground hover:bg-field/90",
        /** Link de cabeçalho ("Ver todas"): tinta, sem cor de marca no cromo. Sem efeito de pressão: é texto. */
        link: "h-auto px-0 text-foreground underline-offset-4 hover:underline active:scale-100",
      },
      size: {
        sm: "h-8 px-3 text-[13px]",
        default: "h-10 px-4",
        lg: "h-11 px-5 text-[15px]",
        icon: "size-9",
        "icon-sm": "size-8 rounded-md",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  /** Mostra spinner e desabilita. Use em toda mutation (regra: nunca falha silenciosa). */
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading, children, disabled, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading ? (
          <>
            <Loader2 aria-hidden className="animate-spin" />
            {children}
          </>
        ) : (
          children
        )}
      </Comp>
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
