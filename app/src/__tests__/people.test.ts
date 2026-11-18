import { describe, expect, it } from '@jest/globals';

import {
  accountCount,
  choiceOf,
  deleteMemberHint,
  freeMemberColor,
  kindLabel,
  memberIdOf,
  memberNameError,
  memberPatch,
  memberSub,
  ownerOptions,
} from '@/lib/people';
import { account, member } from '@/testing/people';

const thiago = member();
const ana = member({ id: 'm-ana', name: 'Ana', user_id: null });

describe('memberNameError', () => {
  it('asks for a name', () => {
    expect(memberNameError('  ', [thiago])).toBe('Dê um nome à pessoa.');
  });

  it('refuses a repeated name, ignoring case, but not the person being renamed', () => {
    expect(memberNameError('ana', [thiago, ana])).toBe('Já existe um responsável com esse nome.');
    expect(memberNameError('Ana', [thiago, ana], 'm-ana')).toBeNull();
  });

  it('keeps “Casa” for the whole household', () => {
    expect(memberNameError('casa', [thiago])).toContain('família toda');
  });

  it('caps the length', () => {
    expect(memberNameError('a'.repeat(81), [])).toBe('Use no máximo 80 letras.');
  });
});

describe('owner choices', () => {
  it('lists each person, then the household', () => {
    expect(ownerOptions([thiago, ana]).map((o) => o.name)).toEqual(['Thiago', 'Ana', 'Casa']);
  });

  it('turns the household choice into no member and back', () => {
    expect(memberIdOf(choiceOf(null))).toBeNull();
    expect(memberIdOf(choiceOf('m-ana'))).toBe('m-ana');
  });
});

describe('accountCount and deleteMemberHint', () => {
  const accounts = [
    account(),
    account({ id: 'a2', member_id: 'm-ana' }),
    account({ id: 'a3', member_id: 'm-ana' }),
  ];

  it('counts the accounts of each person', () => {
    expect(accountCount('m-thiago', accounts)).toBe('1 conta');
    expect(accountCount('m-ana', accounts)).toBe('2 contas');
    expect(accountCount('m-x', accounts)).toBe('Nenhuma conta');
  });

  it('says the accounts go to the household', () => {
    expect(deleteMemberHint('m-thiago', accounts)).toBe('A conta passa a ser da Casa.');
    expect(deleteMemberHint('m-ana', accounts)).toBe('As 2 contas passam a ser da Casa.');
    expect(deleteMemberHint('m-x', accounts)).toBe('Ninguém mais usa esse nome.');
  });
});

describe('who each person is', () => {
  it('names the kind and counts the accounts', () => {
    expect(kindLabel('spouse')).toBe('Cônjuge');
    expect(memberSub(thiago, [account()])).toBe('Eu · 1 conta');
    expect(memberSub({ ...ana, kind: 'family' }, [])).toBe('Família · Nenhuma conta');
  });

  it('picks a colour nobody uses yet', () => {
    expect(freeMemberColor([member({ color: '#5F8F7B' })])).toBe('#4f9a9a');
  });

  it('sends only what changed', () => {
    const base = { name: 'Thiago', kind: 'me' as const, color: '#8a8799' };
    expect(memberPatch(thiago, base)).toBeNull();
    expect(memberPatch(thiago, { ...base, name: ' Thi ', kind: 'other' })).toEqual({
      name: 'Thi',
      kind: 'other',
    });
    expect(memberPatch(thiago, { ...base, color: '#8A8799' })).toBeNull();
    expect(memberPatch(thiago, { ...base, color: '#c7795a' })).toEqual({ color: '#c7795a' });
  });
});
