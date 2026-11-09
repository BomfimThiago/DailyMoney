"use client";

import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { cn } from "@/lib/utils";

export const TooltipProvider = TooltipPrimitive.Provider;

/** Tooltip simples: <Tooltip content="…"><button/></Tooltip>. Requer <TooltipProvider> no app. */
export function Tooltip({
  content,
  children,
  side = "top",
}: {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: "top" | "right" | "bottom" | "left";
}) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          className={cn(
            // Com um tooltip já aberto, o próximo aparece sem animação (instant-open).
            "z-50 max-w-xs origin-[--radix-tooltip-content-transform-origin] rounded-md bg-foreground px-2.5 py-1.5 text-meta text-background shadow-overlay ease-out-strong animate-in data-[state=delayed-open]:duration-[125ms] fade-in-0 zoom-in-95 data-[state=instant-open]:animate-none",
          )}
        >
          {content}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
