"use client";

import * as React from "react";
import { useCreateMember, useDeleteMember, useUpdateMember, type Member } from "@/hooks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Segmented } from "@/components/ui/segmented";
import { useToast } from "@/components/ui/toast";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MemberAvatar } from "@/components/finance/member";
import { ChoiceGrid, colorOptions } from "../../categories/_components/choice-grid";
import { firstUnusedColor } from "../../categories/_components/palette";

type Kind = Member["kind"];

export const KIND_LABEL: Record<Kind, string> = {
  ME: "Eu",
  SPOUSE: "Cônjuge",
  FAMILY: "Família",
  OTHER: "Outro",
};

const KIND_OPTIONS = (Object.keys(KIND_LABEL) as Kind[]).map((k) => ({ value: k, label: KIND_LABEL[k] }));

function MemberColorChoice({
  name,
  value,
  onChange,
  disabled,
}: {
  name: string;
  value: string;
  onChange: (color: string) => void;
  disabled?: boolean;
}) {
  return (
    <ChoiceGrid
      aria-label="Cor"
      shape="round"
      options={colorOptions(value)}
      value={value.toLowerCase()}
      onChange={onChange}
      disabled={disabled}
      render={(color) => <MemberAvatar member={{ name, color }} size="md" />}
    />
  );
}

function nameErrorFor(name: string, others: Member[]): string | undefined {
  const trimmed = name.trim();
  if (!trimmed) return "Informe um nome.";
  if (others.some((m) => m.name.trim().toLowerCase() === trimmed.toLowerCase())) {
    return "Já existe um responsável com esse nome.";
  }
  return undefined;
}

// --- Adicionar ---------------------------------------------------------------

export function AddMemberDialog({
  open,
  onOpenChange,
  members,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  members: Member[];
}) {
  const create = useCreateMember();
  const [name, setName] = React.useState("");
  const [kind, setKind] = React.useState<Kind>("OTHER");
  const [color, setColor] = React.useState("");
  const [submitted, setSubmitted] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setName("");
    setKind("OTHER");
    setColor(firstUnusedColor(members.map((m) => m.color)));
    setSubmitted(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só ao abrir
  }, [open]);

  const error = submitted ? nameErrorFor(name, members) : undefined;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (nameErrorFor(name, members)) return;
    create.mutate({ name: name.trim(), kind, color }, { onSuccess: () => onOpenChange(false) });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit} noValidate>
          <DialogHeader>
            <DialogTitle>Adicionar pessoa</DialogTitle>
            <DialogDescription>
              Quem gasta ou recebe na casa: aparece em cada transação e nos filtros.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5">
            <Field label="Nome" htmlFor="member-name" error={error}>
              <Input
                id="member-name"
                autoFocus
                autoComplete="off"
                value={name}
                invalid={!!error}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
            <Field label="Quem é">
              <Segmented
                aria-label="Quem é"
                className="self-start"
                options={KIND_OPTIONS}
                value={kind}
                onValueChange={setKind}
              />
            </Field>
            <Field label="Cor">
              <MemberColorChoice name={name.trim() || "?"} value={color} onChange={setColor} />
            </Field>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="secondary">
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" loading={create.isPending}>
              Adicionar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// --- Renomear ----------------------------------------------------------------

export function RenameMemberDialog({
  member,
  members,
  onClose,
}: {
  member: Member | null;
  members: Member[];
  onClose: () => void;
}) {
  const update = useUpdateMember();
  const { toast } = useToast();
  const [name, setName] = React.useState("");
  const [submitted, setSubmitted] = React.useState(false);

  React.useEffect(() => {
    if (!member) return;
    setName(member.name);
    setSubmitted(false);
  }, [member]);

  const others = members.filter((m) => m.id !== member?.id);
  const error = submitted ? nameErrorFor(name, others) : undefined;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!member) return;
    setSubmitted(true);
    if (nameErrorFor(name, others)) return;
    const trimmed = name.trim();
    if (trimmed === member.name) return onClose();
    update.mutate(
      { id: member.id, name: trimmed },
      {
        onSuccess: () => {
          toast({ variant: "success", title: "Nome atualizado" });
          onClose();
        },
      },
    );
  }

  return (
    <Dialog open={!!member} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <form onSubmit={submit} noValidate>
          <DialogHeader>
            <DialogTitle>Renomear responsável</DialogTitle>
            <DialogDescription>O novo nome vale para todas as transações.</DialogDescription>
          </DialogHeader>
          <Field label="Nome" htmlFor="member-rename" error={error}>
            <Input
              id="member-rename"
              autoFocus
              autoComplete="off"
              value={name}
              invalid={!!error}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="secondary">
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" loading={update.isPending}>
              Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// --- Mudar cor ---------------------------------------------------------------

export function MemberColorDialog({ member, onClose }: { member: Member | null; onClose: () => void }) {
  const update = useUpdateMember();
  const { toast } = useToast();
  const [color, setColor] = React.useState("");

  React.useEffect(() => {
    if (member) setColor(member.color);
  }, [member]);

  function save() {
    if (!member) return;
    if (color.toLowerCase() === member.color.toLowerCase()) return onClose();
    update.mutate(
      { id: member.id, color },
      {
        onSuccess: () => {
          toast({ variant: "success", title: "Cor atualizada" });
          onClose();
        },
      },
    );
  }

  return (
    <Dialog open={!!member} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cor de {member?.name}</DialogTitle>
          <DialogDescription>Aparece no avatar em transações, filtros e no resumo.</DialogDescription>
        </DialogHeader>
        {member ? <MemberColorChoice name={member.name} value={color || member.color} onChange={setColor} /> : null}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Cancelar</Button>
          </DialogClose>
          <Button onClick={save} loading={update.isPending}>
            Salvar cor
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// --- Excluir -----------------------------------------------------------------

export function DeleteMemberDialog({ member, onClose }: { member: Member | null; onClose: () => void }) {
  const remove = useDeleteMember();

  return (
    <Dialog open={!!member} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Remover {member?.name}?</DialogTitle>
          <DialogDescription>
            As transações de {member?.name} ficam sem responsável. Isso não pode ser desfeito.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Cancelar</Button>
          </DialogClose>
          <Button
            variant="destructive"
            loading={remove.isPending}
            onClick={() => member && remove.mutate(member.id, { onSuccess: onClose })}
          >
            Remover
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
