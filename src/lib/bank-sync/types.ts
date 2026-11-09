import type { BankConnection, Currency } from "@prisma/client";
import type { Decimal } from "@/lib/money";
import type { NormalizedRow } from "@/lib/tabular/types";

// Um serviço de banco conectado (Pluggy no Brasil, Enable Banking na Europa) visto pela
// sincronização: confere a autorização, lista as contas e lê cada uma em linhas de
// importação, sem IA. O resto (importação por conta, revisão, confirmação sozinha quando
// nada muda, não duplicar com extratos) é igual para todos e fica em `sync.ts`.

export interface MappedAccount {
  rows: NormalizedRow[];
  errors: { rowIndex: number; message: string; raw: string }[];
  /** Dia mais antigo que o serviço devolveu (antes do filtro): a janela que ele cobre. */
  earliest: Date | null;
}

export interface SyncAccount {
  /**
   * Identidade fixa da conta, usada como `contentHash` das importações dela: a mesma a
   * cada sincronização (e a cada nova autorização), para atualizar em vez de duplicar.
   */
  hash: string;
  /** "Conta corrente", "Cartão de crédito"… */
  label: string;
  /** Cartão de crédito: as compras dele ficam juntas na lista de Transações. */
  kind: "card" | "account";
  read(from: Date): Promise<MappedAccount>;
}

export interface BankProvider {
  /** `detectedFormat` das importações que ele gera. */
  format: string;
  /** Confere que a autorização vale; lança um erro que diz o que fazer quando não vale. */
  check(conn: BankConnection): Promise<{ consentExpiresAt: Date | null }>;
  accounts(conn: BankConnection): Promise<SyncAccount[]>;
  /**
   * Investimentos da conexão, quando o serviço informa (Pluggy). Um que não dá para ler
   * vai em `errors`, sem derrubar os outros.
   */
  investments?(conn: BankConnection): Promise<{ positions: MappedInvestment[]; errors: string[] }>;
  /** Encerra a autorização no serviço ao desconectar (quando ele permite). */
  revoke?(conn: BankConnection): Promise<void>;
}

/** Investimento (posição) como o banco informa hoje, já validado e em Decimal. */
export interface MappedInvestment {
  externalId: string;
  name: string;
  type: string;
  subtype: string | null;
  issuer: string | null;
  code: string | null;
  currency: Currency;
  /** Saldo líquido. */
  balance: Decimal;
  amountOriginal: Decimal | null;
  rate: Decimal | null;
  rateType: string | null;
  fixedAnnualRate: Decimal | null;
  dueDate: Date | null;
  status: string;
  /** Dia a que o saldo se refere. */
  valueDate: Date;
}
