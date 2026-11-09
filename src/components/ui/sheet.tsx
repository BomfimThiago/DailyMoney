"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { DialogOverlay, useReturnFocus } from "./dialog";

/** Painel lateral (detalhe de transação, filtros no celular). */
export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;

export function SheetContent({
  className,
  children,
  side = "right",
  title,
  onOpenAutoFocus,
  onCloseAutoFocus,
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
  side?: "right" | "bottom";
  /** Rótulo pequeno no topo (ex.: "Detalhe da transação"). */
  title?: string;
}) {
  const focus = useReturnFocus({ onOpenAutoFocus, onCloseAutoFocus });
  return (
    <DialogPrimitive.Portal>
      <DialogOverlay className="bg-foreground/10 backdrop-blur-0" />
      <DialogPrimitive.Content
        {...focus}
        className={cn(
          // Painel: curva de drawer, entra em 300ms e sai em 200ms (antes 150ms com `ease`, brusco).
          "fixed z-50 flex flex-col bg-card shadow-overlay ease-drawer focus:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:duration-300 data-[state=closed]:duration-200",
          side === "right" &&
            "inset-y-0 right-0 w-full max-w-[400px] data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right",
          side === "bottom" &&
            "inset-x-0 bottom-0 max-h-[90dvh] rounded-t-3xl pb-[env(safe-area-inset-bottom)] data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom",
          className,
        )}
        {...props}
      >
        <div className="flex items-center justify-between border-b px-6 py-4">
          <DialogPrimitive.Title className="text-[13px] font-semibold text-muted-foreground">
            {title ?? ""}
          </DialogPrimitive.Title>
          <DialogPrimitive.Close
            aria-label="Fechar"
            className="rounded-md p-1 text-subtle hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X aria-hidden className="size-4" />
          </DialogPrimitive.Close>
        </div>
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function SheetBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex-1 space-y-5 overflow-y-auto overscroll-contain px-6 py-6", className)} {...props} />;
}

export function SheetFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex items-center justify-between gap-2 border-t px-6 py-4", className)} {...props} />;
}
