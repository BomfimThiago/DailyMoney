/**
 * Teste de ponta a ponta PELA INTERFACE dos bancos europeus (Enable Banking), contra o
 * servidor falso `scripts/fake-enablebanking.ts` (dados sintéticos; nada real):
 *
 *  1. conectar: Importar › Conectar banco › Europa › país e banco › "Ir para o banco" ›
 *     aprovar na página do banco › volta ao app com a conexão e as contas;
 *  2. sincronizar: só as lançadas entram (a pendente não), sinal pelo indicador, revisão
 *     e confirmação; sincronizar de novo sem novidade confirma sozinho (0 novas);
 *  3. transação nova no banco: só ela entra;
 *  4. autorização vencida: o erro aparece, "Autorizar de novo" renova a MESMA conexão e a
 *     sincronização seguinte não duplica nada (a conta é a mesma em outra sessão);
 *  5. recusar no banco: a tela de retorno diz que nada foi conectado;
 *  6. desconectar: as transações ficam.
 *
 * Requisitos: o servidor falso e o app apontando para ele (ver o cabeçalho do servidor),
 * usuário demo (`npx tsx --env-file=.env.local scripts/seed-demo.ts`).
 *
 *   npm run e2e:enablebanking [-- http://localhost:3100]
 *
 * Screenshots em .e2e-output/enable-banking/.
 */
import { mkdirSync, rmSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { Browser, sleep } from "../../.claude/skills/taste-skill/scripts/lib/cdp.mjs";

if (typeof WebSocket === "undefined") {
  console.error(
    `Este teste precisa de WebSocket: use Node 22+ ou rode com --experimental-websocket (Node ${process.version}).`,
  );
  process.exit(2);
}
if (!process.env.DEMO_EMAIL || !process.env.DEMO_PASSWORD) {
  console.error("Defina DEMO_EMAIL e DEMO_PASSWORD (rode com --env-file=.env.local).");
  process.exit(2);
}

const FAKE = process.env.FAKE_ENABLEBANKING_URL ?? "http://localhost:3999";
const BANK = "Banco Demo";
const OUT = ".e2e-output/enable-banking";

async function findApp() {
  const ports = [3000, 3001, 3002, 3003, 3004, 3005, 3100];
  const candidates = process.argv[2]
    ? [process.argv[2]]
    : [process.env.E2E_BASE_URL, ...ports.map((n) => `http://localhost:${n}`)];
  for (const url of candidates.filter(Boolean)) {
    try {
      const r = await fetch(`${url}/login`, { signal: AbortSignal.timeout(4000) });
      if (r.ok && /<title>[^<]*Daily Money<\/title>/.test(await r.text())) return url.replace(/\/$/, "");
    } catch {}
  }
  console.error("Não achei o daily-money. Suba com `npm run dev` ou passe a URL.");
  process.exit(2);
}
const APP = await findApp();
try {
  await fetch(`${FAKE}/aspsps`, { signal: AbortSignal.timeout(3000) });
} catch {
  console.error(`O Enable Banking falso não responde em ${FAKE}: npx tsx scripts/fake-enablebanking.ts`);
  process.exit(2);
}
console.log(`daily-money em ${APP}, Enable Banking falso em ${FAKE}\n`);

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const prisma = new PrismaClient();
const results = [];
let shot = 0;

// Login da conta demo pela API; os cookies vão para o navegador (nunca são impressos).
const login = await fetch(`${APP}/api/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: process.env.DEMO_EMAIL, password: process.env.DEMO_PASSWORD }),
});
if (!login.ok) {
  console.error(`Login da conta demo falhou (HTTP ${login.status}). Rode o seed.`);
  process.exit(2);
}
const cookies = login.headers.getSetCookie().map((c) => {
  const [pair] = c.split(";");
  const i = pair.indexOf("=");
  return { name: pair.slice(0, i), value: pair.slice(i + 1), url: APP };
});
const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
const api = (path, init = {}) =>
  fetch(`${APP}${path}`, { ...init, headers: { cookie: cookieHeader, ...(init.headers ?? {}) } });

const { providers } = await (await api("/api/connections")).json();
if (!providers?.enablebanking) {
  console.error(
    "O app não está com a Enable Banking ligada: suba com ENABLE_BANKING_APP_ID/KEY_FILE/API_URL (ver scripts/fake-enablebanking.ts).",
  );
  process.exit(2);
}

const user = await prisma.user.findUniqueOrThrow({ where: { email: process.env.DEMO_EMAIL } });
async function clean() {
  await prisma.bankConnection.deleteMany({ where: { userId: user.id, provider: "enablebanking" } });
  await prisma.upload.deleteMany({ where: { userId: user.id, bank: BANK } });
  await prisma.transaction.deleteMany({ where: { userId: user.id, bank: BANK } });
}
await clean();
await fetch(`${FAKE}/_control/reset`, { method: "POST" });

process.env.TASTE_COOKIES = JSON.stringify(cookies);
const b = await Browser.launch({ width: 1440, height: 1000 });
const p = await b.newPage({ width: 1440, height: 1000 });
const consoleErrors = [];
p.browser.on(p.sessionId, "Runtime.exceptionThrown", (e) =>
  consoleErrors.push(e.exceptionDetails?.exception?.description ?? "exception"),
);

async function snap(name) {
  shot++;
  await p.screenshot({ path: `${OUT}/${String(shot).padStart(2, "0")}-${name}.jpg` });
}
async function waitFor(desc, fn, timeoutMs = 25000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try {
      if (await p.eval(fn)) return;
    } catch {}
    await sleep(300);
  }
  await snap(`FALHA-${desc}`);
  throw new Error(`timeout: ${desc}`);
}
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✔" : "✘"} ${name}${detail ? ` — ${detail}` : ""}`);
}
const click = (label, scope = "document") =>
  p.eval(`(() => {
    const el = [...${scope}.querySelectorAll('button, a, [cmdk-item]')].find(e => e.innerText.trim() === ${JSON.stringify(label)} || e.getAttribute('aria-label') === ${JSON.stringify(label)});
    if (!el) return false; el.click(); return true;
  })()`);
const bodyText = () => p.eval(() => document.body.innerText);
const conn = () => prisma.bankConnection.findFirst({ where: { userId: user.id, provider: "enablebanking" } });
const txs = () => prisma.transaction.findMany({ where: { userId: user.id, bank: BANK }, orderBy: { date: "asc" } });
const sum = (rows) => rows.reduce((s, t) => s + Math.round(Number(t.baseAmount) * 100), 0) / 100;

/** Importar › Conectar banco › Europa › Banco Demo › Ir para o banco. Termina na página do banco. */
async function goToBank() {
  await p.goto(`${APP}/upload`, { settleMs: 2500 });
  await waitFor(
    "botão Conectar banco",
    `[...document.querySelectorAll('button')].some(b => b.innerText.trim() === 'Conectar banco')`,
  );
  await click("Conectar banco");
  await waitFor("diálogo", `!!document.querySelector('[role="dialog"]')`);
  await click("Europa", `document.querySelector('[role="dialog"]')`);
  await waitFor(
    "formulário europeu",
    `document.querySelector('[role="dialog"]').innerText.includes('Conectar banco europeu')`,
  );
  await waitFor("bancos carregados", `!document.getElementById('eu-bank')?.disabled`);
  await p.eval(`document.getElementById('eu-bank').click()`);
  await waitFor("lista de bancos", `document.querySelectorAll('[cmdk-item]').length > 0`);
  const names = await p.eval(`[...document.querySelectorAll('[cmdk-item]')].map(e => e.innerText.trim())`);
  await snap("escolher-banco");
  await click(BANK);
  await sleep(300);
  await click("Ir para o banco");
  await waitFor("página do banco", `location.origin === ${JSON.stringify(FAKE)}`);
  return names;
}
async function approve() {
  await p.eval(`document.getElementById('approve').click()`);
  await waitFor(
    "volta ao app em Importar",
    `location.origin === ${JSON.stringify(APP)} && location.pathname === '/upload'`,
    30000,
  );
}
async function syncNow() {
  await p.goto(`${APP}/upload`, { settleMs: 2500 });
  await waitFor(
    "Sincronizar agora",
    `[...document.querySelectorAll('button')].some(b => b.innerText.trim() === 'Sincronizar agora')`,
  );
  await p.eval(`window.__toasts = document.querySelectorAll('[role="status"], [role="alert"]').length`);
  await click("Sincronizar agora");
  await waitFor(
    "resultado da sincronização",
    `/sincronizado|Erro ao sincronizar/.test(document.body.innerText)`,
    40000,
  );
  await sleep(500);
  return bodyText();
}
async function reviewAndConfirm(linkText) {
  await p.goto(`${APP}/upload`, { settleMs: 2500 });
  await waitFor(
    `link ${linkText}`,
    `[...document.querySelectorAll('a')].some(a => a.innerText.trim() === ${JSON.stringify(linkText)})`,
  );
  await click(linkText);
  await waitFor(
    "página de revisão",
    `location.pathname.startsWith('/review/') && /Confirmar \\d+ transa/.test(document.body.innerText)`,
  );
  await sleep(800);
  await snap(`revisao-${linkText.replace(/\s+/g, "-").toLowerCase()}`);
  await p.eval(
    `[...document.querySelectorAll('button')].find(b => /^Confirmar \\d+ transa/.test(b.innerText.trim())).click()`,
  );
  await sleep(600);
  if (await p.eval(`!!document.querySelector('[role="dialog"]')`)) {
    await p.eval(
      `[...document.querySelectorAll('[role="dialog"] button')].filter(b => b.innerText.trim() && b.innerText.trim() !== 'Revisar antes' && b.getAttribute('aria-label') !== 'Fechar').pop().click()`,
    );
  }
  await waitFor("importação confirmada", `document.body.innerText.includes('Importação confirmada')`);
}

try {
  // ── 1. conectar ─────────────────────────────────────────────────────────────
  const names = await goToBank();
  check(
    "lista os bancos do país, só os de pessoa física",
    names.includes(BANK) && names.includes("CaixaBank") && !names.includes("Empresa Only"),
    names.join(", "),
  );
  await snap("pagina-do-banco");
  await approve();
  await waitFor("toast conectado", `document.body.innerText.includes(${JSON.stringify(`${BANK} conectado`)})`);
  await snap("conectado");
  let c = await conn();
  check(
    "conexão gravada com as 2 contas",
    c?.accounts?.length === 2 && c.aspspCountry === "ES",
    `${c?.accounts?.length} contas`,
  );
  const page = await bodyText();
  check(
    "a linha do banco mostra as contas",
    page.includes("Conta corrente EUR ••1332") && page.includes("Cartão EUR ••6789"),
  );
  check(
    "o uid da sessão não vai para a tela",
    !JSON.stringify(await (await api("/api/connections")).json()).includes(c.accounts[0].uid),
  );

  // ── 2. sincronizar e revisar ────────────────────────────────────────────────
  let t = await syncNow();
  await snap("sincronizado");
  check(
    "sincronização: corrente com 6 novas (a pendente não entra), cartão com 2",
    t.includes("Conta corrente: 6 novas") && t.includes("Cartão: 2 novas"),
    t.match(/sincronizado[^\n]*\n[^\n]*/)?.[0],
  );
  await reviewAndConfirm("Revisar conta corrente");
  await reviewAndConfirm("Revisar"); // sobrou uma revisão: o botão é só "Revisar"
  let rows = await txs();
  const checking = rows.filter((r) => !/ZARA/.test(r.description));
  check("8 transações gravadas", rows.length === 8, `${rows.length}`);
  check("conta corrente soma 1515,93 (salário − aluguel − compras)", sum(checking) === 1515.93, `${sum(checking)}`);
  check(
    "cartão: compra e devolução se anulam (sinal pelo indicador)",
    sum(rows.filter((r) => /ZARA/.test(r.description))) === 0,
  );
  check("nenhuma pendente gravada", !rows.some((r) => /NETFLIX/.test(r.description)));

  t = await syncNow();
  check(
    "sincronizar de novo: em dia, confirmado sozinho",
    t.includes("Conta corrente: em dia") && t.includes("Cartão: em dia"),
  );
  check("nada duplicado", (await txs()).length === 8);

  // ── 3. novidade no banco ────────────────────────────────────────────────────
  await fetch(`${FAKE}/_control/new-transaction`, { method: "POST" });
  t = await syncNow();
  check("transação nova: só ela entra", t.includes("Conta corrente: 1 nova") && t.includes("Cartão: em dia"));
  await reviewAndConfirm("Revisar");
  check("9 transações", (await txs()).length === 9);

  // ── 4. autorização vencida → autorizar de novo ──────────────────────────────
  await fetch(`${FAKE}/_control/expire`, { method: "POST" });
  t = await syncNow();
  await snap("autorizacao-vencida");
  check("autorização vencida: erro visível", t.includes("Erro ao sincronizar") && t.includes("Autorizar de novo"));
  // sem recarregar: a linha do banco já mostra o erro e o botão de renovar
  let rowUpdated = true;
  try {
    await waitFor(
      "botão Autorizar de novo na linha",
      `[...document.querySelectorAll('button')].some(b => b.innerText.trim() === 'Autorizar de novo')`,
      8000,
    );
  } catch {
    rowUpdated = false;
  }
  check('a linha do banco mostra o erro e "Autorizar de novo" sem recarregar', rowUpdated);
  await snap("linha-autorizar-de-novo");
  await p.goto(`${APP}/upload`, { settleMs: 2500 });
  const before = await conn();
  await click("Autorizar de novo");
  await waitFor("página do banco (renovar)", `location.origin === ${JSON.stringify(FAKE)}`);
  await approve();
  await waitFor("toast renovada", `document.body.innerText.includes('autorização renovada')`);
  c = await conn();
  check(
    "renovou a MESMA conexão, com sessão nova",
    (await prisma.bankConnection.count({ where: { userId: user.id, provider: "enablebanking" } })) === 1 &&
      c.id === before.id &&
      c.itemId !== before.itemId &&
      !c.lastError,
  );
  t = await syncNow();
  check(
    "depois de renovar: em dia, nada duplicado",
    t.includes("Conta corrente: em dia") && (await txs()).length === 9,
  );

  // ── 5. recusar no banco ─────────────────────────────────────────────────────
  await goToBank();
  await p.eval(`document.getElementById('deny').click()`);
  await waitFor(
    "tela de retorno com o erro",
    `location.pathname === '/connections/callback' && document.body.innerText.includes('O banco não concluiu a autorização')`,
  );
  await snap("recusado");
  check("recusar: diz que nada foi conectado", (await bodyText()).includes("Nada foi conectado"));
  check(
    "recusar: continua 1 conexão",
    (await prisma.bankConnection.count({ where: { userId: user.id, provider: "enablebanking" } })) === 1,
  );

  // ── 6. desconectar ──────────────────────────────────────────────────────────
  await p.goto(`${APP}/upload`, { settleMs: 2500 });
  await click("Desconectar");
  await waitFor(
    "diálogo desconectar",
    `document.querySelector('[role="dialog"]')?.innerText.includes('A autorização no banco é encerrada')`,
  );
  await p.eval(
    `[...document.querySelectorAll('[role="dialog"] button')].find(b => b.innerText.trim() === 'Desconectar').click()`,
  );
  await waitFor("toast desconectado", `document.body.innerText.includes('Banco desconectado')`);
  check("desconectado; as transações ficam", !(await conn()) && (await txs()).length === 9);
  check("sem erros de JavaScript na tela", consoleErrors.length === 0, consoleErrors.slice(0, 2).join(" | "));
} catch (err) {
  check("execução", false, err.message);
} finally {
  await clean();
  await b.close();
  await prisma.$disconnect();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} ok · screenshots em ${OUT}/`);
process.exit(failed.length ? 1 : 0);
