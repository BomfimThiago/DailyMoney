import * as React from "react";
import {
  ArrowLeftRight,
  Briefcase,
  Car,
  ChevronDown,
  CircleEllipsis,
  CirclePlus,
  FileText,
  Gamepad2,
  Gift,
  GraduationCap,
  HeartPulse,
  House,
  Landmark,
  Plane,
  Repeat,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Tag,
  TrendingUp,
  Undo2,
  Utensils,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { tint } from "@/lib/color";
import { cn } from "@/lib/utils";

// Ícones disponíveis para categorias (nomes = Category.icon no banco).
export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  "shopping-cart": ShoppingCart,
  utensils: Utensils,
  car: Car,
  home: House,
  "file-text": FileText,
  "heart-pulse": HeartPulse,
  "graduation-cap": GraduationCap,
  "shopping-bag": ShoppingBag,
  repeat: Repeat,
  "gamepad-2": Gamepad2,
  plane: Plane,
  landmark: Landmark,
  "circle-ellipsis": CircleEllipsis,
  wallet: Wallet,
  briefcase: Briefcase,
  "undo-2": Undo2,
  "trending-up": TrendingUp,
  gift: Gift,
  "circle-plus": CirclePlus,
  transfer: ArrowLeftRight,
};

export interface CategoryLike {
  name: string;
  /** Cor hex vinda do banco (Category.color). */
  color: string;
  icon?: string | null;
}

const ICON_SIZE = {
  sm: "size-6 rounded-md [&_svg]:size-3.5",
  md: "size-8 rounded-lg [&_svg]:size-4",
  lg: "size-11 rounded-xl [&_svg]:size-5",
};

/** Quadrado com o ícone da categoria tingido com a cor dela. */
export function CategoryIcon({
  category,
  size = "md",
  className,
}: {
  category: CategoryLike;
  size?: keyof typeof ICON_SIZE;
  className?: string;
}) {
  const Icon = (category.icon && CATEGORY_ICONS[category.icon]) || Tag;
  return (
    <span
      aria-hidden
      className={cn("grid shrink-0 place-items-center", ICON_SIZE[size], className)}
      style={{ backgroundColor: `${category.color}17`, color: category.color }}
    >
      <Icon />
    </span>
  );
}

/**
 * Rótulo de categoria: pílula neutra com ponto de cor (a cor vem do banco).
 * `suggested`: sugestão da IA ainda não aceita (ícone de brilho azul).
 * `interactive`: mostra chevron (é gatilho de seleção).
 */
export function CategoryPill({
  category,
  suggested,
  interactive,
  className,
}: {
  category: CategoryLike | null;
  suggested?: boolean;
  interactive?: boolean;
  className?: string;
}) {
  const base = "inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-md px-2 text-[12.5px] font-medium";
  if (!category) {
    return (
      <span className={cn(base, "bg-warning-soft text-warning", className)}>
        Sem categoria
        {interactive ? <ChevronDown aria-hidden className="size-3.5" /> : null}
      </span>
    );
  }
  return (
    <span className={cn(base, "border border-input bg-field text-foreground", className)}>
      {suggested ? (
        <Sparkles className="size-3 text-transfer" role="img" aria-label="Sugestão" />
      ) : (
        <span className="size-2 rounded-full" style={{ backgroundColor: category.color }} />
      )}
      {category.name}
      {interactive ? <ChevronDown aria-hidden className="size-3.5 text-subtle" /> : null}
    </span>
  );
}

/**
 * Ladrilho de categoria do estilo pastel: o nome sobre o fundo pálido do matiz da
 * categoria, com a tinta escura do mesmo matiz. Sem ícone em quadrado tingido.
 * Use no Resumo e em linhas de transação; `size="sm"` dentro de sublinhas.
 */
export function CategoryTag({
  category,
  size = "md",
  className,
}: {
  category: CategoryLike;
  size?: "sm" | "md";
  className?: string;
}) {
  const t = tint(category.color);
  return (
    <span
      className={cn(
        "inline-flex max-w-full flex-none items-center truncate whitespace-nowrap font-medium",
        size === "sm" ? "h-5 rounded-[5px] px-1.5 text-[12px]" : "h-7 rounded-lg px-2.5 text-[14px]",
        className,
      )}
      style={{ backgroundColor: t.bg, color: t.ink }}
    >
      {category.name}
    </span>
  );
}
