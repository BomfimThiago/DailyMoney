"use client";

import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";

export const Tabs = TabsPrimitive.Root;

export const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List ref={ref} className={cn("flex items-center gap-6 border-b", className)} {...props} />
));
TabsList.displayName = "TabsList";

/** Aba sublinhada com contador opcional ("Precisam de revisão 9"). */
export const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger> & { count?: number }
>(({ className, children, count, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "group -mb-px inline-flex h-10 items-center gap-2 border-b-2 border-transparent text-[13.5px] font-medium text-subtle transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=active]:border-foreground data-[state=active]:font-semibold data-[state=active]:text-foreground",
      className,
    )}
    {...props}
  >
    {children}
    {count !== undefined ? (
      <span className="rounded-full bg-secondary px-1.5 text-[11.5px] font-semibold text-muted-foreground group-data-[state=active]:bg-foreground group-data-[state=active]:text-background">
        {count}
      </span>
    ) : null}
  </TabsPrimitive.Trigger>
));
TabsTrigger.displayName = "TabsTrigger";

export const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    // O painel recebe Tab (Radix); o foco precisa aparecer (WCAG 2.4.7).
    className={cn(
      "rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      className,
    )}
    {...props}
  />
));
TabsContent.displayName = "TabsContent";
