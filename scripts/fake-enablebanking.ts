/**
 * Enable Banking de mentira, para testar a conexão de bancos europeus sem conta real.
 * Confere a assinatura de cada pedido (JWT RS256 com a chave do app, kid = App ID, como a
 * API real) e responde no formato da referência: bancos, autorização (com uma página de
 * "banco" para aprovar ou recusar), sessão, transações paginadas.
 *
 *   npx tsx scripts/fake-enablebanking.ts --key .secrets/fake-enablebanking.pem [--port 3999]
 *
 * Sem o arquivo da chave, gera um par novo e grava a privada nele (*.pem fica fora do git).
 * Suba o app com:
 *   ENABLE_BANKING_APP_ID=fake-app ENABLE_BANKING_KEY_FILE=<a mesma chave> \
 *   ENABLE_BANKING_API_URL=http://localhost:3999
 *
 * Controle: POST /_control/reset (volta ao começo), POST /_control/new-transaction (uma
 *           compra nova hoje na conta corrente), POST /_control/expire (sessões vencem).
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createPrivateKey, createPublicKey, generateKeyPairSync, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { jwtVerify } from "jose";

const arg = (name: string, fallback?: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const PORT = Number(arg("port", "3999"));
const KEY = arg("key", ".secrets/fake-enablebanking.pem")!;
const APP_ID = "fake-app";

if (!existsSync(KEY)) {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  mkdirSync(dirname(KEY), { recursive: true });
  writeFileSync(KEY, privateKey.export({ type: "pkcs8", format: "pem" }), { mode: 0o600 });
  console.log(`chave nova em ${KEY}`);
}
const publicKey = createPublicKey(createPrivateKey(readFileSync(KEY, "utf8")));

const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

// Contas do "banco": a identificação (hash) é fixa; o uid muda a cada sessão, como na API.
const ACCOUNTS = [
  {
    key: "hash-checking",
    iban: "ES9121000418450200051332",
    currency: "EUR",
    cash_account_type: "CACC",
    name: "Cuenta Online",
  },
  { key: "hash-card", iban: "ES7921000813610123456789", currency: "EUR", cash_account_type: "CARD", name: "Tarjeta" },
];
type Tx = Record<string, unknown>;
const TXS: Record<string, Tx[]> = {
  "hash-checking": [
    {
      entry_reference: "E-001",
      transaction_amount: { currency: "EUR", amount: "2500.00" },
      credit_debit_indicator: "CRDT",
      status: "BOOK",
      booking_date: day(-20),
      debtor: { name: "ACME SL" },
      remittance_information: ["Nómina"],
    },
    {
      entry_reference: "E-002",
      transaction_amount: { currency: "EUR", amount: "850.00" },
      credit_debit_indicator: "DBIT",
      status: "BOOK",
      booking_date: day(-18),
      creditor: { name: "Inmobiliaria Sol" },
      remittance_information: ["Alquiler"],
    },
    {
      entry_reference: "E-003",
      transaction_amount: { currency: "EUR", amount: "64.37" },
      credit_debit_indicator: "DBIT",
      status: "BOOK",
      booking_date: day(-15),
      creditor: { name: "MERCADONA" },
      remittance_information: ["Compra tarjeta 1234 MERCADONA VALENCIA"],
    },
    {
      entry_reference: null,
      transaction_amount: { currency: "EUR", amount: "3.50" },
      credit_debit_indicator: "DBIT",
      status: "BOOK",
      booking_date: day(-12),
      note: "Comisión mantenimiento",
    },
    {
      entry_reference: "E-005",
      transaction_amount: { currency: "EUR", amount: "25.00" },
      credit_debit_indicator: "DBIT",
      status: "BOOK",
      booking_date: day(-9),
      creditor: { name: "Laura" },
      remittance_information: ["Bizum a Laura cena"],
    },
    {
      entry_reference: "E-006",
      transaction_amount: { currency: "EUR", amount: "41.20" },
      credit_debit_indicator: "DBIT",
      status: "BOOK",
      booking_date: day(-5),
      creditor: { name: "IBERDROLA" },
      remittance_information: ["Recibo luz"],
    },
    {
      entry_reference: "P-007",
      transaction_amount: { currency: "EUR", amount: "9.99" },
      credit_debit_indicator: "DBIT",
      status: "PDNG",
      booking_date: day(-1),
      creditor: { name: "NETFLIX" },
    },
  ],
  "hash-card": [
    {
      entry_reference: "C-001",
      transaction_amount: { currency: "EUR", amount: "18.90" },
      credit_debit_indicator: "DBIT",
      status: "BOOK",
      booking_date: day(-10),
      creditor: { name: "ZARA" },
      remittance_information: ["ZARA VALENCIA"],
    },
    {
      entry_reference: "C-002",
      transaction_amount: { currency: "EUR", amount: "18.90" },
      credit_debit_indicator: "CRDT",
      status: "BOOK",
      booking_date: day(-7),
      debtor: { name: "ZARA" },
      remittance_information: ["Devolución ZARA"],
    },
  ],
};

const INITIAL = JSON.stringify(TXS);

const pending = new Map<
  string,
  { state: string; redirect: string; aspsp: { name: string; country: string }; validUntil: string }
>();
const codes = new Map<string, { aspsp: { name: string; country: string }; validUntil: string }>();
const sessions = new Map<
  string,
  { status: string; validUntil: string; aspsp: { name: string; country: string }; uids: Map<string, string> }
>();
const uidToKey = new Map<string, { session: string; key: string }>();

const send = (res: ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
};
const fail = (res: ServerResponse, status: number, error: string, message: string) =>
  send(res, status, { code: status, error, message });
const body = (req: IncomingMessage) =>
  new Promise<Record<string, any>>((resolve) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => resolve(raw ? JSON.parse(raw) : {}));
  });

async function authorized(req: IncomingMessage): Promise<boolean> {
  const token = (req.headers.authorization ?? "").replace(/^Bearer /, "");
  try {
    const { protectedHeader } = await jwtVerify(token, publicKey, {
      algorithms: ["RS256"],
      issuer: "enablebanking.com",
      audience: "api.enablebanking.com",
    });
    return protectedHeader.kid === APP_ID;
  } catch {
    return false;
  }
}

const BANKS = [
  {
    name: "Banco Demo",
    country: "ES",
    logo: null,
    psu_types: ["personal", "business"],
    maximum_consent_validity: 15552000,
    beta: false,
  },
  {
    name: "CaixaBank",
    country: "ES",
    logo: null,
    psu_types: ["personal"],
    maximum_consent_validity: 7776000,
    beta: false,
  },
  {
    name: "Empresa Only",
    country: "ES",
    logo: null,
    psu_types: ["business"],
    maximum_consent_validity: 7776000,
    beta: false,
  },
];

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  const path = url.pathname;
  console.log(req.method, path);

  // --- página do "banco" (o navegador do usuário, sem JWT) ---
  if (path === "/bank/authorize") {
    const p = pending.get(url.searchParams.get("id") ?? "");
    if (!p) return fail(res, 404, "NOT_FOUND", "authorization not found");
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    return res.end(`<!doctype html><title>${p.aspsp.name}</title><body style="font-family:sans-serif;padding:40px">
      <h1>${p.aspsp.name} (falso)</h1><p>Autorizar a leitura das contas?</p>
      <a id="approve" href="/bank/decide?id=${url.searchParams.get("id")}&ok=1">Autorizar</a> ·
      <a id="deny" href="/bank/decide?id=${url.searchParams.get("id")}&ok=0">Recusar</a></body>`);
  }
  if (path === "/bank/decide") {
    const id = url.searchParams.get("id") ?? "";
    const p = pending.get(id);
    if (!p) return fail(res, 404, "NOT_FOUND", "authorization not found");
    pending.delete(id);
    const back = new URL(p.redirect);
    back.searchParams.set("state", p.state);
    if (url.searchParams.get("ok") === "1") {
      const code = randomUUID();
      codes.set(code, { aspsp: p.aspsp, validUntil: p.validUntil });
      back.searchParams.set("code", code);
    } else {
      back.searchParams.set("error", "access_denied");
      back.searchParams.set("error_description", "User cancelled");
    }
    res.writeHead(302, { Location: back.toString() });
    return res.end();
  }
  if (path === "/_control/new-transaction" && req.method === "POST") {
    const n = TXS["hash-checking"].length + 1;
    TXS["hash-checking"].push({
      entry_reference: `E-NEW-${n}`,
      transaction_amount: { currency: "EUR", amount: "12.00" },
      credit_debit_indicator: "DBIT",
      status: "BOOK",
      booking_date: day(0),
      creditor: { name: "CAFETERIA" },
      remittance_information: ["Café"],
    });
    return send(res, 200, { ok: true });
  }
  if (path === "/_control/reset" && req.method === "POST") {
    Object.assign(TXS, JSON.parse(INITIAL));
    pending.clear();
    codes.clear();
    sessions.clear();
    uidToKey.clear();
    return send(res, 200, { ok: true });
  }
  if (path === "/_control/expire" && req.method === "POST") {
    for (const s of sessions.values()) s.status = "EXPIRED";
    return send(res, 200, { ok: true });
  }

  // --- API (com JWT) ---
  if (!(await authorized(req))) return fail(res, 401, "UNAUTHORIZED_ACCESS", "Invalid JWT");

  if (path === "/aspsps" && req.method === "GET") {
    return send(res, 200, { aspsps: BANKS.filter((b) => b.country === url.searchParams.get("country")) });
  }
  if (path === "/auth" && req.method === "POST") {
    const b = await body(req);
    if (!b.access?.valid_until || !b.aspsp?.name || !b.state || !b.redirect_url)
      return fail(res, 422, "WRONG_REQUEST_PARAMETERS", "missing fields");
    const bank = BANKS.find((x) => x.name === b.aspsp.name && x.country === b.aspsp.country);
    if (!bank) return fail(res, 422, "ASPSP_NOT_FOUND", "unknown aspsp");
    if (new Date(b.access.valid_until).getTime() > Date.now() + bank.maximum_consent_validity * 1000) {
      return fail(res, 422, "WRONG_REQUEST_PARAMETERS", "valid_until exceeds maximum_consent_validity");
    }
    const id = randomUUID();
    pending.set(id, { state: b.state, redirect: b.redirect_url, aspsp: b.aspsp, validUntil: b.access.valid_until });
    return send(res, 200, {
      url: `http://localhost:${PORT}/bank/authorize?id=${id}`,
      authorization_id: id,
      psu_id_hash: "x",
    });
  }
  if (path === "/sessions" && req.method === "POST") {
    const b = await body(req);
    const c = codes.get(b.code);
    if (!c) return fail(res, 422, "WRONG_AUTHORIZATION_CODE", "code not found or already used");
    codes.delete(b.code);
    const session_id = randomUUID();
    const uids = new Map<string, string>();
    for (const a of ACCOUNTS) {
      const uid = randomUUID();
      uids.set(a.key, uid);
      uidToKey.set(uid, { session: session_id, key: a.key });
    }
    sessions.set(session_id, { status: "AUTHORIZED", validUntil: c.validUntil, aspsp: c.aspsp, uids });
    return send(res, 200, {
      session_id,
      aspsp: c.aspsp,
      psu_type: "personal",
      access: { valid_until: c.validUntil },
      accounts: ACCOUNTS.map((a) => ({
        uid: uids.get(a.key),
        identification_hash: a.key,
        identification_hashes: [a.key],
        account_id: { iban: a.iban },
        name: a.name,
        currency: a.currency,
        cash_account_type: a.cash_account_type,
      })),
    });
  }
  const sess = path.match(/^\/sessions\/([^/]+)$/);
  if (sess) {
    const s = sessions.get(sess[1]);
    if (!s) return fail(res, 404, "NOT_FOUND", "session not found");
    if (req.method === "DELETE") {
      s.status = "CLOSED";
      return send(res, 200, { message: "OK" });
    }
    return send(res, 200, {
      status: s.status,
      access: { valid_until: s.validUntil },
      accounts: [...s.uids.values()],
      aspsp: s.aspsp,
    });
  }
  const txm = path.match(/^\/accounts\/([^/]+)\/transactions$/);
  if (txm && req.method === "GET") {
    const ref = uidToKey.get(txm[1]);
    const s = ref && sessions.get(ref.session);
    if (!ref || !s) return fail(res, 404, "ACCOUNT_DOES_NOT_EXIST", "account not found");
    if (s.status !== "AUTHORIZED") return fail(res, 401, "EXPIRED_SESSION", "Session is not authorized");
    const from = url.searchParams.get("date_from") ?? "0000-00-00";
    const all = TXS[ref.key].filter((t) => String(t.booking_date) >= from);
    const start = Number(url.searchParams.get("continuation_key") ?? "0");
    const page = all.slice(start, start + 3);
    return send(res, 200, { transactions: page, continuation_key: start + 3 < all.length ? String(start + 3) : null });
  }
  fail(res, 404, "NOT_FOUND", `no route ${req.method} ${path}`);
}).listen(PORT, () => console.log(`Enable Banking falso em http://localhost:${PORT}`));
