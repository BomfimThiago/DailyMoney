"use client";

import * as React from "react";
import { MoreHorizontal, Palette, Pencil, Trash2, UserPlus, Users } from "lucide-react";
import { useMembers, type Member } from "@/hooks";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MemberAvatar } from "@/components/finance/member";
import { EmptyState, ErrorState } from "@/components/states";
import {
  AddMemberDialog,
  DeleteMemberDialog,
  KIND_LABEL,
  MemberColorDialog,
  RenameMemberDialog,
} from "./_components/member-dialogs";

type Action = { type: "rename" | "color" | "delete"; member: Member } | null;

export default function MembersPage() {
  const members = useMembers();
  const [adding, setAdding] = React.useState(false);
  const [action, setAction] = React.useState<Action>(null);
  const list = members.data ?? [];
  const close = () => setAction(null);
  const target = (type: NonNullable<Action>["type"]) => (action?.type === type ? action.member : null);

  return (
    <div>
      <PageHeader
        title="Responsáveis"
        description="Quem fez cada gasto — usado nos filtros, no resumo e na revisão."
        actions={
          <Button onClick={() => setAdding(true)}>
            <UserPlus />
            Adicionar pessoa
          </Button>
        }
      />

      {members.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy>
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="flex items-center gap-4 p-6">
              <Skeleton className="size-12 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-16" />
              </div>
            </Card>
          ))}
        </div>
      ) : members.isError ? (
        <ErrorState error={members.error} onRetry={() => members.refetch()} />
      ) : list.length === 0 ? (
        <EmptyState
          icon={<Users />}
          title="Nenhum responsável ainda"
          hint="Adicione quem divide as contas com você para saber quem gastou o quê."
          action={
            <Button onClick={() => setAdding(true)}>
              <UserPlus />
              Adicionar pessoa
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((m) => (
            <Card key={m.id}>
              <CardContent className="flex items-center gap-4 py-6">
                <MemberAvatar member={m} size="lg" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-display-sm">{m.name}</p>
                  <p className="text-meta text-subtle">{KIND_LABEL[m.kind] ?? m.kind}</p>
                </div>
                <DropdownMenu modal={false}>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon-sm" aria-label={`Ações de ${m.name}`}>
                      <MoreHorizontal />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem onSelect={() => setAction({ type: "rename", member: m })}>
                      <Pencil />
                      Renomear
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setAction({ type: "color", member: m })}>
                      <Palette />
                      Mudar cor
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem destructive onSelect={() => setAction({ type: "delete", member: m })}>
                      <Trash2 />
                      Excluir
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </CardContent>
            </Card>
          ))}

          <Card>
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="flex size-full min-h-24 items-center justify-center gap-2 rounded-2xl px-6 py-6 text-body font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-4"
            >
              <UserPlus />
              Adicionar pessoa
            </button>
          </Card>
        </div>
      )}

      <AddMemberDialog open={adding} onOpenChange={setAdding} members={list} />
      <RenameMemberDialog member={target("rename")} members={list} onClose={close} />
      <MemberColorDialog member={target("color")} onClose={close} />
      <DeleteMemberDialog member={target("delete")} onClose={close} />
    </div>
  );
}
