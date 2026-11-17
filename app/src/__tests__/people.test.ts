import { describe, expect, it } from '@jest/globals';

import { accountCount, deleteMemberHint, memberNameError, ownerName } from '@/lib/people';
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

describe('ownerName', () => {
  it('names the owner, or the household when there is none', () => {
    expect(ownerName('m-ana', [thiago, ana])).toBe('Ana');
    expect(ownerName(null, [thiago, ana])).toBe('Casa');
    expect(ownerName('gone', [thiago])).toBe('Casa');
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
