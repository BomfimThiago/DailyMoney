import { api } from './api';
import type { DotOption } from '@/components/DotSelect';

import type { Account, Family, Member } from './types';

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

export function addMember(name: string) {
  return api<Member>('/family/members', {
    method: 'POST',
    body: JSON.stringify({ name: name.trim() }),
  });
}

export function editMember(id: string, patch: { name?: string; color?: string }) {
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
