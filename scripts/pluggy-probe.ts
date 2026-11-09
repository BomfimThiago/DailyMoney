/**
 * Teste da conexão com a Pluggy (Meu Pluggy, uso pessoal), SÓ DE LEITURA: não grava nada
 * no banco do app. Mostra o FORMATO dos dados — status de cada conexão, contas, quantas
 * transações, período, campos presentes, convenção de sinal — e nunca descrições nem
 * valores, para dar para colar a saída numa conversa sem expor o extrato.
 *
 * Precisa no .env (ver .env.example): PLUGGY_APP_ID e PLUGGY_APP_SECRET (Client ID e
 * Client Secret da Application) e PLUGGY_ITEM_IDS (ids separados por vírgula, copiados de
 * Applications › Demo › Connected Items no Dashboard da Pluggy). Sem itens, só confere o login.
 *
 *   npx tsx --env-file=.env scripts/pluggy-probe.ts
 *
 * Com --save, grava também a resposta crua de cada conta em fixtures/pluggy/ (fora do git),
 * que é a fixture real do teste do leitor (tests/pluggy.test.ts).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const SAVE = process.argv.includes("--save");

const API = "https://api.pluggy.ai";

function env(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Falta ${name} no .env`);
  return v;
}

async function call<T>(path: string, init: RequestInit & { apiKey?: string } = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.apiKey ? { "X-API-KEY": init.apiKey } : {}),
    },
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${path.split("?")[0]} → ${res.status}: ${body.slice(0, 300)}`);
  return JSON.parse(body) as T;
}

interface Item {
  id: string;
  status: string;
  executionStatus?: string;
  connector?: { name?: string; isOpenFinance?: boolean };
  lastUpdatedAt?: string | null;
  consentExpiresAt?: string | null;
  error?: { code?: string; message?: string } | null;
}
interface Account {
  id: string;
  type: string;
  subtype?: string;
  currencyCode?: string;
  name?: string;
}
interface Tx {
  id: string;
  date: string;
  amount: number;
  type?: "DEBIT" | "CREDIT";
  status?: "POSTED" | "PENDING";
  currencyCode?: string;
  amountInAccountCurrency?: number | null;
  providerId?: string | null;
  creditCardMetadata?: Record<string, unknown> | null;
  [k: string]: unknown;
}
interface Page<T> {
  results: T[];
  page: number;
  totalPages: number;
  total: number;
}
interface CursorPage<T> {
  results: T[];
  next: string | null;
}

const count = <T>(xs: T[], key: (x: T) => string) =>
  Object.fromEntries([...xs.reduce((m, x) => m.set(key(x), (m.get(key(x)) ?? 0) + 1), new Map<string, number>())]);

async function main() {
  const { apiKey } = await call<{ apiKey: string }>("/auth", {
    method: "POST",
    body: JSON.stringify({ clientId: env("PLUGGY_APP_ID"), clientSecret: env("PLUGGY_APP_SECRET") }),
  });
  console.log("✓ Login na Pluggy ok (chave de API válida por 2h)");
  const itemIds = (process.env.PLUGGY_ITEM_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!itemIds.length) {
    console.log(
      "Nenhuma conexão em PLUGGY_ITEM_IDS. No Dashboard da Pluggy: Applications › sua aplicação › Demo ›\n" +
        "Connect Account › MeuPluggy; depois copie cada itemId de Connected Items para o .env.",
    );
    return;
  }

  for (const itemId of itemIds) {
    const item = await call<Item>(`/items/${itemId}`, { apiKey });
    console.log(`\n■ Conexão ${itemId.slice(0, 8)}… — ${item.connector?.name ?? "?"}`);
    console.log({
      status: item.status,
      executionStatus: item.executionStatus,
      openFinance: item.connector?.isOpenFinance,
      ultimaAtualizacao: item.lastUpdatedAt,
      consentimentoVence: item.consentExpiresAt,
      erro: item.error?.code ?? null,
    });

    const accounts = await call<Page<Account>>(`/accounts?itemId=${itemId}`, { apiKey });
    for (const acc of accounts.results) {
      const txs: Tx[] = [];
      // /transactions (por página) foi desativado (410); a v2 pagina por cursor em `next` e não aceita `from`
      let path: string | null = `/v2/transactions?accountId=${acc.id}`;
      let pages = 0;
      while (path) {
        const p: CursorPage<Tx> = await call<CursorPage<Tx>>(path, { apiKey });
        txs.push(...p.results);
        pages++;
        path = !p.next
          ? null
          : p.next.startsWith("http")
            ? p.next.replace(API, "")
            : `/v2/transactions?accountId=${acc.id}&cursor=${encodeURIComponent(p.next)}`;
        if (pages > 100) throw new Error("Mais de 100 páginas: o cursor não está avançando");
      }
      if (SAVE) {
        const dir = resolve(__dirname, "../fixtures/pluggy");
        mkdirSync(dir, { recursive: true });
        const file = resolve(dir, `${itemId.slice(0, 8)}-${acc.type.toLowerCase()}.json`);
        writeFileSync(file, JSON.stringify({ account: acc, transactions: txs }, null, 1));
        console.log(`  (salvo em fixtures/pluggy/${file.split("/").pop()})`);
      }
      const dates = txs.map((t) => t.date.slice(0, 10)).sort();
      const keys = count(
        txs.flatMap((t) => Object.keys(t).filter((k) => t[k] != null)),
        (k) => k,
      );
      console.log(`  • Conta ${acc.type}/${acc.subtype ?? "?"} em ${acc.currencyCode ?? "?"}`, {
        transacoes: txs.length,
        periodo: dates.length ? `${dates[0]} → ${dates[dates.length - 1]}` : "—",
        status: count(txs, (t) => t.status ?? "?"),
        moedas: count(txs, (t) => t.currencyCode ?? "?"),
        // como o sinal do valor se relaciona com DEBIT/CREDIT nesta conta
        sinal: count(txs, (t) => `${t.type ?? "?"}:${t.amount < 0 ? "negativo" : "positivo"}`),
        comProviderId: txs.filter((t) => t.providerId).length,
        comValorNaMoedaDaConta: txs.filter((t) => t.amountInAccountCurrency != null).length,
        idsRepetidos: txs.length - new Set(txs.map((t) => t.id)).size,
        campos: keys,
      });
    }

    await probeInvestments(itemId, apiKey);
  }
}

interface Investment {
  id: string;
  type?: string;
  subtype?: string | null;
  status?: string | null;
  currencyCode?: string;
  [k: string]: unknown;
}
interface InvestmentTx {
  type?: string;
  movementType?: string | null;
  date?: string;
  [k: string]: unknown;
}

/** Investimentos da conexão: o formato (tipos, campos preenchidos, movimentos), sem nomes nem valores. */
async function probeInvestments(itemId: string, apiKey: string) {
  const invs: Investment[] = [];
  for (let page = 1; ; page++) {
    const p = await call<Page<Investment>>(`/investments?itemId=${itemId}&page=${page}&pageSize=500`, { apiKey });
    invs.push(...p.results);
    if (page >= (p.totalPages || 1)) break;
  }
  const txsByInv: Record<string, InvestmentTx[]> = {};
  for (const inv of invs) {
    const txs: InvestmentTx[] = [];
    for (let page = 1; ; page++) {
      const p = await call<Page<InvestmentTx>>(`/investments/${inv.id}/transactions?page=${page}&pageSize=500`, {
        apiKey,
      });
      txs.push(...p.results);
      if (page >= (p.totalPages || 1)) break;
    }
    txsByInv[inv.id] = txs;
  }
  const allTx = Object.values(txsByInv).flat();
  if (SAVE && invs.length) {
    const dir = resolve(__dirname, "../fixtures/pluggy");
    mkdirSync(dir, { recursive: true });
    const file = resolve(dir, `${itemId.slice(0, 8)}-investments.json`);
    writeFileSync(file, JSON.stringify({ investments: invs, transactions: txsByInv }, null, 1));
    console.log(`  (salvo em fixtures/pluggy/${file.split("/").pop()})`);
  }
  const dates = allTx
    .map((t) => (t.date ?? "").slice(0, 10))
    .filter(Boolean)
    .sort();
  console.log(`  • Investimentos`, {
    posicoes: invs.length,
    tipos: count(invs, (i) => `${i.type ?? "?"}/${i.subtype ?? "?"}`),
    status: count(invs, (i) => i.status ?? "?"),
    moedas: count(invs, (i) => i.currencyCode ?? "?"),
    campos: count(
      invs.flatMap((i) => Object.keys(i).filter((k) => i[k] != null)),
      (k) => k,
    ),
    movimentos: allTx.length,
    periodoMovimentos: dates.length ? `${dates[0]} → ${dates[dates.length - 1]}` : "—",
    tiposMovimento: count(allTx, (t) => `${t.type ?? "?"}:${t.movementType ?? "?"}`),
    camposMovimento: count(
      allTx.flatMap((t) => Object.keys(t).filter((k) => t[k] != null)),
      (k) => k,
    ),
  });
}

main().catch((err) => {
  console.error(`\n✗ ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
