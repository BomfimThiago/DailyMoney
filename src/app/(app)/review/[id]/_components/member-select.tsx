"use client";

import * as React from "react";
import type { Member } from "@/hooks";
import { MemberAvatar, MemberChip } from "@/components/finance/member";
import {
  SelectMenu,
  SelectMenuContent,
  SelectMenuItem,
  SelectMenuSeparator,
  SelectMenuTrigger,
} from "@/components/ui/select-menu";
import { cn } from "@/lib/utils";

const NONE = "__none__";
const EMPTY = "__empty__";

/**
 * Responsável de uma linha: o gatilho é o próprio <MemberChip> (vazio = "Definir").
 * `trigger` troca o visual do gatilho (ex.: ação em lote "Definir responsável").
 */
export function MemberSelect({
  members,
  value,
  onChange,
  disabled,
  trigger,
  className,
}: {
  members: Member[];
  value: string | null;
  onChange: (memberId: string | null) => void;
  disabled?: boolean;
  trigger?: React.ReactNode;
  className?: string;
}) {
  const member = members.find((m) => m.id === value) ?? null;
  return (
    <SelectMenu
      value={value ?? ""}
      onValueChange={(v) => {
        if (v === EMPTY) return;
        onChange(v === NONE ? null : v);
      }}
      disabled={disabled}
    >
      <SelectMenuTrigger
        // role=combobox só tira o nome do rótulo (não do conteúdo): rótulo + o que aparece (WCAG 2.5.3).
        aria-label={`Responsável: ${member?.name ?? (typeof trigger === "string" ? trigger : "Definir")}`}
        className={cn(
          trigger
            ? "h-8 w-auto text-[13px]"
            : "h-8 w-auto gap-1 border-transparent bg-transparent px-1.5 hover:bg-secondary",
          className,
        )}
      >
        {trigger ?? <MemberChip member={member} />}
      </SelectMenuTrigger>
      <SelectMenuContent>
        {members.length === 0 ? (
          <SelectMenuItem value={EMPTY} disabled>
            Nenhum responsável cadastrado
          </SelectMenuItem>
        ) : (
          members.map((m) => (
            <SelectMenuItem key={m.id} value={m.id}>
              <MemberAvatar member={m} size="xs" />
              {m.name}
            </SelectMenuItem>
          ))
        )}
        {value ? (
          <>
            <SelectMenuSeparator />
            <SelectMenuItem value={NONE}>Sem responsável</SelectMenuItem>
          </>
        ) : null}
      </SelectMenuContent>
    </SelectMenu>
  );
}
