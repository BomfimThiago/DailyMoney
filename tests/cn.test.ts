import { expect, it } from "vitest";
import { cn } from "@/lib/utils";
it("keeps custom font sizes next to colors", () => {
  expect(cn("text-meta text-subtle")).toBe("text-meta text-subtle");
  expect(cn("font-display text-display-sm text-foreground")).toBe("font-display text-display-sm text-foreground");
  expect(cn("text-meta", "text-body")).toBe("text-body");
  expect(cn("shadow-surface", "shadow-control")).toBe("shadow-control");
});
