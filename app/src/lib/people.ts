import { api } from './api';
import type { DotOption } from '@/components/DotSelect';

import { PALETTE } from './categories';
import type { Account, Family, Member, MemberKind } from './types';

// Responsáveis (from the old app): who each account belongs to. An account with no one
// belongs to the whole household; its lines follow the account's owner.
export const HOUSEHOLD = 'Casa';

// The household has no member id; a dropdown needs one.
export const HOUSEHOLD_ID = 'casa';

// The choices of a Responsável dropdown: each person, then the household.
export function ownerOptions(members: Member[]): DotOption[] {
  return [
    ...members.map((m) => ({ id: m.id, name: m.name, color: m.color })),
    { id: HOUSEHOLD_ID, name: HOUSEHOLD, color: null },
  ];
}

// Dropdown id → the member id the API takes (null = household), and back.
export function memberIdOf(choice: string): string | null {
  return choice === HOUSEHOLD_ID ? null : choice;
}

export function choiceOf(memberId: string | null | undefined): string {
  return memberId ?? HOUSEHOLD_ID;
}

export function getFamily() {
  return api<Family>('/family');
}

// "Quem é" (from the old app): who the person is to the household.
export const MEMBER_KINDS: { value: MemberKind; label: string }[] = [
  { value: 'me', label: 'Eu' },
  { value: 'spouse', label: 'Cônjuge' },
  { value: 'family', label: 'Família' },
  { value: 'other', label: 'Outro' },
];

export function kindLabel(kind: MemberKind): string {
  return MEMBER_KINDS.find((k) => k.value === kind)?.label ?? '';
}

// Under the name: "Cônjuge · 2 contas".
export function memberSub(m: Member, accounts: Account[]): string {
  return `${kindLabel(m.kind)} · ${accountCount(m.id, accounts)}`;
}

// The first colour no one uses yet, for a new person.
export function freeMemberColor(members: Member[]): string {
  const used = new Set(members.map((m) => m.color.toLowerCase()));
  return PALETTE.find((p) => !used.has(p)) ?? PALETTE[0];
}

export type NewMember = { name: string; kind: MemberKind; color: string };

export function addMember(m: NewMember) {
  return api<Member>('/family/members', {
    method: 'POST',
    body: JSON.stringify({ name: m.name.trim(), kind: m.kind, color: m.color }),
  });
}

export type MemberPatch = { name?: string; color?: string; kind?: MemberKind };

// Only what changed, or null when nothing did.
export function memberPatch(m: Member, next: NewMember): MemberPatch | null {
  const patch: MemberPatch = {};
  if (next.name.trim() !== m.name) patch.name = next.name.trim();
  if (next.color.toLowerCase() !== m.color.toLowerCase()) patch.color = next.color;
  if (next.kind !== m.kind) patch.kind = next.kind;
  return Object.keys(patch).length ? patch : null;
}

export function editMember(id: string, patch: MemberPatch) {
  return api<Member>(`/family/members/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
}

export function deleteMember(id: string) {
  return api<void>(`/family/members/${id}`, { method: 'DELETE' });
}

export function setAccountOwner(accountId: string, memberId: string | null) {
  return api<Account>(`/accounts/${accountId}`, {
    method: 'PATCH',
    body: JSON.stringify({ member_id: memberId }),
  });
}

export function memberNameError(name: string, members: Member[], id?: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return 'Dê um nome à pessoa.';
  if (trimmed.length > 80) return 'Use no máximo 80 letras.';
  const lower = trimmed.toLowerCase();
  if (lower === HOUSEHOLD.toLowerCase()) return '“Casa” já é a opção da família toda.';
  if (members.some((m) => m.id !== id && m.name.trim().toLowerCase() === lower)) {
    return 'Já existe um responsável com esse nome.';
  }
  return null;
}

export function accountCount(memberId: string, accounts: Account[]): string {
  const n = accounts.filter((a) => a.member_id === memberId).length;
  if (n === 0) return 'Nenhuma conta';
  return n === 1 ? '1 conta' : `${n} contas`;
}

// What happens to a person's accounts when they are removed.
export function deleteMemberHint(memberId: string, accounts: Account[]): string {
  const n = accounts.filter((a) => a.member_id === memberId).length;
  if (n === 0) return 'Ninguém mais usa esse nome.';
  const which = n === 1 ? 'A conta passa' : `As ${n} contas passam`;
  return `${which} a ser da ${HOUSEHOLD}.`;
}

// A card's closing and due days: its purchases count in the month of their bill.
export function setBillDays(accountId: string, closeDay: number | null, dueDay: number | null) {
  return api<Account>(`/accounts/${accountId}`, {
    method: 'PATCH',
    body: JSON.stringify({ bill_close_day: closeDay, bill_due_day: dueDay }),
  });
}

// A day of the month typed by the person (1–31), or null when empty or not a day.
export function billDay(text: string): number | null {
  const n = Number(text.trim());
  return Number.isInteger(n) && n >= 1 && n <= 31 ? n : null;
}
