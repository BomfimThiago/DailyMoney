"use client";

import * as React from "react";
import * as AccordionPrimitive from "@radix-ui/react-accordion";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Accordion. `variant="card"`: cada item é um card com sombra (listas de
 * detalhes). `variant="plain"`: divisórias finas (filtros, FAQ, configurações).
 */
type Variant = "plain" | "card";
const VariantContext = React.createContext<Variant>("plain");

export function Accordion({
  variant = "plain",
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Root> & { variant?: Variant }) {
  return (
    <VariantContext.Provider value={variant}>
      <AccordionPrimitive.Root
        className={cn(variant === "card" ? "flex flex-col gap-3" : "divide-y border-y", className)}
        {...(props as React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Root>)}
      />
    </VariantContext.Provider>
  );
}

export const AccordionItem = React.forwardRef<
  React.ElementRef<typeof AccordionPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Item>
>(({ className, ...props }, ref) => {
  const variant = React.useContext(VariantContext);
  return (
    <AccordionPrimitive.Item
      ref={ref}
      className={cn(variant === "card" && "overflow-hidden rounded-card border bg-card", className)}
      {...props}
    />
  );
});
AccordionItem.displayName = "AccordionItem";

export const AccordionTrigger = React.forwardRef<
  React.ElementRef<typeof AccordionPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Trigger> & {
    /** Conteúdo à direita do título (valor, badge) — continua visível fechado. */
    aside?: React.ReactNode;
  }
>(({ className, children, aside, ...props }, ref) => {
  const variant = React.useContext(VariantContext);
  return (
    <AccordionPrimitive.Header className="flex">
      <AccordionPrimitive.Trigger
        ref={ref}
        className={cn(
          "group flex flex-1 items-center gap-3 py-3.5 text-left text-[13.5px] font-semibold outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
          variant === "card" && "px-5 py-4",
          className,
        )}
        {...props}
      >
        <span className="flex min-w-0 flex-1 items-center gap-3">{children}</span>
        {aside ? <span className="shrink-0 font-normal">{aside}</span> : null}
        <ChevronDown
          aria-hidden
          className="size-4 shrink-0 text-subtle transition-transform duration-200 ease-out-strong group-data-[state=open]:rotate-180"
        />
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  );
});
AccordionTrigger.displayName = "AccordionTrigger";

export const AccordionContent = React.forwardRef<
  React.ElementRef<typeof AccordionPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Content>
>(({ className, children, ...props }, ref) => {
  const variant = React.useContext(VariantContext);
  return (
    <AccordionPrimitive.Content
      ref={ref}
      className="overflow-hidden text-[13.5px] data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down"
      {...props}
    >
      <div className={cn("pb-4 text-muted-foreground", variant === "card" && "border-t px-5 pt-4", className)}>
        {children}
      </div>
    </AccordionPrimitive.Content>
  );
});
AccordionContent.displayName = "AccordionContent";
