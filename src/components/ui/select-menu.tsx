"use client";

import * as React from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Select estilizado (Radix). Para listas curtas (até ~10 itens) que precisam de
 * cor, ícone ou avatar no item. Listas longas → <Combobox>.
 */
export const SelectMenu = SelectPrimitive.Root;
export const SelectMenuValue = SelectPrimitive.Value;
export const SelectMenuGroup = SelectPrimitive.Group;

export const SelectMenuTrigger = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger> & { invalid?: boolean }
>(({ className, children, invalid, ...props }, ref) => (
  <SelectPrimitive.Trigger
    ref={ref}
    aria-invalid={invalid || undefined}
    className={cn(
      "flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-control bg-field px-3 text-[13.5px] focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60 data-[placeholder]:text-subtle [&>span]:flex [&>span]:items-center [&>span]:gap-2 [&>span]:truncate",
      invalid && "border-destructive",
      className,
    )}
    {...props}
  >
    {children}
    <SelectPrimitive.Icon asChild>
      <ChevronDown aria-hidden className="size-4 shrink-0 text-subtle" />
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
));
SelectMenuTrigger.displayName = "SelectMenuTrigger";

export const SelectMenuContent = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(({ className, children, position = "popper", ...props }, ref) => (
  <SelectPrimitive.Portal>
    <SelectPrimitive.Content
      ref={ref}
      position={position}
      sideOffset={6}
      className={cn(
        "relative z-50 max-h-80 min-w-[var(--radix-select-trigger-width)] origin-[--radix-select-content-transform-origin] overflow-hidden rounded-xl bg-popover text-popover-foreground shadow-overlay ease-out-strong data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
        className,
      )}
      {...props}
    >
      <SelectPrimitive.Viewport className="p-1">{children}</SelectPrimitive.Viewport>
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
));
SelectMenuContent.displayName = "SelectMenuContent";

export const SelectMenuLabel = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Label>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Label
    ref={ref}
    className={cn("px-2.5 pb-1 pt-2 text-meta font-medium text-subtle", className)}
    {...props}
  />
));
SelectMenuLabel.displayName = "SelectMenuLabel";

export const SelectMenuItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={cn(
      "relative flex w-full cursor-default select-none items-center gap-2 rounded-lg py-2 pl-2.5 pr-8 text-[13.5px] outline-none data-[disabled]:pointer-events-none data-[highlighted]:bg-secondary data-[disabled]:opacity-50",
      className,
    )}
    {...props}
  >
    <SelectPrimitive.ItemText asChild>
      <span className="flex items-center gap-2">{children}</span>
    </SelectPrimitive.ItemText>
    <SelectPrimitive.ItemIndicator className="absolute right-2.5">
      <Check aria-hidden className="size-4 text-primary" />
    </SelectPrimitive.ItemIndicator>
  </SelectPrimitive.Item>
));
SelectMenuItem.displayName = "SelectMenuItem";

export const SelectMenuSeparator = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Separator ref={ref} className={cn("my-1 h-px bg-border", className)} {...props} />
));
SelectMenuSeparator.displayName = "SelectMenuSeparator";
