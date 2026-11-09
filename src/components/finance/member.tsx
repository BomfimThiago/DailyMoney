import * as React from "react";
import { UserPlus } from "lucide-react";
import { tint } from "@/lib/color";
import { cn } from "@/lib/utils";

export interface MemberLike {
  name: string;
  /** Cor hex vinda do banco (Member.color). */
  color: string;
}

const SIZE = {
  xs: "size-5 text-[11px]",
  sm: "size-7 text-[12px]",
  md: "size-8 text-[13px]",
  lg: "size-12 text-[20px]",
};

/** Inicial do responsável num círculo pálido do matiz dele, com a tinta escura do mesmo matiz. */
export function MemberAvatar({
  member,
  size = "sm",
  className,
}: {
  member: MemberLike;
  size?: keyof typeof SIZE;
  className?: string;
}) {
  const t = tint(member.color);
  return (
    <span
      title={member.name}
      className={cn("inline-grid shrink-0 place-items-center rounded-full font-semibold", SIZE[size], className)}
      style={{ backgroundColor: t.bg, color: t.ink }}
    >
      {member.name.trim().charAt(0).toUpperCase()}
    </span>
  );
}

/** Avatar + nome. Sem responsável: chip âmbar "Definir" (pede ação). */
export function MemberChip({ member, className }: { member: MemberLike | null; className?: string }) {
  if (!member) {
    return (
      <span
        className={cn(
          "inline-flex h-6 items-center gap-1.5 rounded-md bg-warning-soft px-2 text-[12.5px] font-medium text-warning",
          className,
        )}
      >
        <UserPlus className="size-3.5" />
        Definir
      </span>
    );
  }
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-[13px] text-muted-foreground", className)}>
      <MemberAvatar member={member} size="xs" />
      {member.name}
    </span>
  );
}
