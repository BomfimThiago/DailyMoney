// Sample people and accounts for the Responsáveis tests.
import { builder } from './builder';
import type { Account, Member } from '@/lib/types';

export const member = builder<Member>(() => ({
  id: 'm-thiago',
  name: 'Thiago',
  color: '#8a8799',
  kind: 'me',
  user_id: 'u-thiago',
}));

export const account = builder<Account>(() => ({
  id: 'a-nubank',
  name: 'Nubank',
  bank: 'Nubank',
  currency: 'BRL',
  is_card: false,
  member_id: 'm-thiago',
}));
