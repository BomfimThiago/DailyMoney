import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Ícone à esquerda (ex.: <Search />). */
  icon?: React.ReactNode;
  /** Marca o campo como inválido (borda vermelha + aria-invalid). */
  invalid?: boolean;
}

const base =
  "flex h-9 w-full rounded-lg border border-control bg-field px-3 text-[13.5px] shadow-[0_1px_2px_rgba(16,24,40,.04)] transition-colors placeholder:text-subtle focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-60 file:border-0 file:bg-transparent file:text-sm file:font-medium";

const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, type, icon, invalid, ...props }, ref) => {
  const input = (
    <input
      type={type}
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        base,
        icon && "pl-9",
        invalid && "border-destructive focus-visible:border-destructive focus-visible:ring-destructive/20",
        className,
      )}
      {...props}
    />
  );
  if (!icon) return input;
  return (
    <div className="relative w-full">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle [&_svg]:size-4">
        {icon}
      </span>
      {input}
    </div>
  );
});
Input.displayName = "Input";

export { Input };
