import * as React from "react";
import { cn } from "@/lib/utils";

const Label = React.forwardRef<HTMLLabelElement, React.LabelHTMLAttributes<HTMLLabelElement>>(
  ({ className, ...props }, ref) => (
    <label
      ref={ref}
      className={cn(
        "text-meta font-medium text-subtle peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
        className,
      )}
      {...props}
    />
  ),
);
Label.displayName = "Label";

/** Rótulo + controle + ajuda/erro, sempre na mesma ordem. */
export function Field({
  label,
  hint,
  error,
  htmlFor,
  children,
  className,
}: {
  label: string;
  hint?: string;
  error?: string;
  htmlFor?: string;
  children: React.ReactNode;
  className?: string;
}) {
  // Liga rótulo, ajuda e erro ao controle (aria-describedby / aria-invalid), para leitores
  // de tela lerem o erro junto do campo. Sem htmlFor, gera um id e o passa ao controle.
  const auto = React.useId();
  const child = React.isValidElement<Record<string, unknown>>(children) ? children : null;
  const controlId = htmlFor ?? (child?.props.id as string | undefined) ?? (child ? `${auto}-control` : undefined);
  const noteId = error || hint ? `${auto}-note` : undefined;
  const control = child
    ? React.cloneElement(child, {
        id: controlId,
        "aria-describedby": [child.props["aria-describedby"], noteId].filter(Boolean).join(" ") || undefined,
        "aria-invalid": error ? true : child.props["aria-invalid"],
      })
    : children;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={controlId}>{label}</Label>
      {control}
      {error ? (
        <p id={noteId} role="alert" className="text-meta font-medium text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p id={noteId} className="text-meta text-subtle">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export { Label };
