export type Currency = 'BRL' | 'USD' | 'EUR';

export interface Member {
  id: string;
  name: string;
  color: string;
  user_id: string | null;
}

export interface Family {
  id: string;
  name: string;
  display_currency: Currency;
  month_start_day: number;
  members: Member[];
}

export interface Me {
  id: string;
  email: string;
  name: string;
  picture_url: string | null;
  family: Family;
}

export interface TokenPair {
  access_token: string;
  refresh_token: string;
}
