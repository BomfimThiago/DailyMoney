/**
 * Teste de ponta a ponta PELA INTERFACE da importação idempotente e das exclusões.
 *
 * Dirige um Chrome headless logado na conta demo (dados sintéticos; nada real):
 * envia um CSV pelo campo de upload, revisa e confirma; escolhe uma categoria no
 * painel da transação; simula um "leitor antigo" com bugs (valor lido errado e uma
 * linha inventada); reenvia o MESMO arquivo e confere que corrige sem duplicar e sem
 * perder a escolha do usuário; testa extrato sobreposto, "excluir só a importação",
 * "excluir com as transações" e a exclusão de uma transação. Limpa antes e depois.
 *
 * Requisitos: Chrome instalado, `npm run dev` rodando (em qualquer porta: o teste acha
 * sozinho), usuário demo criado (`npx tsx --env-file=.env.local scripts/seed-demo.ts`).
 *
 *   npm run e2e:import                 # procura o daily-money nas portas 3000–3005 e 3100
 *   npm run e2e:import -- http://localhost:3100
 *
 * Screenshots de cada passo em .e2e-output/import-idempotency/.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { Browser, sleep } from "../../.claude/skills/taste-skill/scripts/lib/cdp.mjs";

if (typeof WebSocket === "undefined") {
  console.error(
    `Este teste precisa de WebSocket: use Node 22+ ou rode com --experimental-websocket (Node ${process.version}).`,
  );
  process.exit(2);
}

// Acha o daily-money: a porta 3000 pode ser de outro projeto (aí o login "falha" com 500).
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
  console.error(
    `Não achei o daily-money em ${candidates.filter(Boolean).join(", ")}. Suba com \`npm run dev\` ou passe a URL: npm run e2e:import -- http://localhost:PORTA`,
  );
  process.exit(2);
}
const APP = await findApp();
console.log(`daily-money em ${APP}\n`);
const OUT = ".e2e-output/import-idempotency";
const BANK = "TestBank E2E";
const results = [];
let shot = 0;
const prisma = new PrismaClient();

if (!process.env.DEMO_EMAIL || !process.env.DEMO_PASSWORD) {
  console.error("Defina DEMO_EMAIL e DEMO_PASSWORD (rode com --env-file=.env.local).");
  process.exit(2);
}

// CSVs sintéticos (layout espanhol, lido pela heurística, sem IA).
const FILES = mkdtempSync(join(tmpdir(), "dm-e2e-"));
writeFileSync(
  join(FILES, "octubre.csv"),
  "Fecha;Concepto;Importe;Divisa\n01/10/2026;Mercadona;-45,20;EUR\n02/10/2026;Cabify;-12,40;EUR\n03/10/2026;Farmacia Central;-1.234,56;EUR\n",
);
writeFileSync(
  join(FILES, "octubre-sobreposto.csv"),
  "Fecha;Concepto;Importe;Divisa\n02/10/2026;Cabify;-12,40;EUR\n03/10/2026;Farmacia Central;-1.234,56;EUR\n04/10/2026;Glovo;-21,90;EUR\n",
);
writeFileSync(
  join(FILES, "descartar.csv"),
  "Fecha;Concepto;Importe;Divisa\n06/10/2026;Panaderia Sol;-8,50;EUR\n06/10/2026;Saldo del dia;-15,12;EUR\n",
);
writeFileSync(
  join(FILES, "com-erro.csv"),
  "Fecha;Concepto;Importe;Divisa\n07/10/2026;Kiosko Luz;-3,20;EUR\n99/99/2026;Linha quebrada;-1,00;EUR\n",
);
writeFileSync(join(FILES, "contrato.docx"), "nao e extrato");
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

// Login da conta demo pela API; os cookies vão para o navegador (nunca são impressos).
const login = await fetch(`${APP}/api/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: process.env.DEMO_EMAIL, password: process.env.DEMO_PASSWORD }),
});
if (!login.ok) {
  console.error(
    login.status === 401
      ? "Login da conta demo recusado: rode o seed (npx tsx --env-file=.env.local scripts/seed-demo.ts)."
      : `Login da conta demo falhou em ${APP} (HTTP ${login.status}).`,
  );
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

async function cleanTestData() {
  const { uploads } = await (await api("/api/uploads")).json();
  for (const u of uploads.filter((u) => u.bank === BANK)) {
    await api(`/api/uploads/${u.id}?transactions=delete`, { method: "DELETE" });
  }
  const user = await prisma.user.findUniqueOrThrow({ where: { email: process.env.DEMO_EMAIL } });
  await prisma.transaction.deleteMany({ where: { userId: user.id, bank: BANK } });
}
await cleanTestData();

process.env.TASTE_COOKIES = JSON.stringify(cookies);
const b = await Browser.launch({ width: 1440, height: 1000 });
const p = await b.newPage({ width: 1440, height: 1000 });
const consoleErrors = [];
p.browser.on(p.sessionId, "Runtime.exceptionThrown", (e) =>
  consoleErrors.push(e.exceptionDetails?.exception?.description ?? "exception"),
);
p.browser.on(p.sessionId, "Runtime.consoleAPICalled", (e) => {
  if (e.type === "error")
    consoleErrors.push(
      e.args
        .map((a) => a.value ?? a.description ?? "")
        .join(" ")
        .slice(0, 200),
    );
});

const text = () => p.eval(() => document.body.innerText);
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
async function snap(name) {
  shot++;
  await p.screenshot({ path: `${OUT}/${String(shot).padStart(2, "0")}-${name}.jpg` });
}
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✔" : "✘"} ${name}${detail ? ` — ${detail}` : ""}`);
}
const click = (selectorText, scope = "document") =>
  p.eval(`(() => {
    const root = ${scope};
    const el = [...root.querySelectorAll('button, a, [role="option"], [cmdk-item]')].find(e => e.innerText.trim() === ${JSON.stringify(selectorText)} || e.getAttribute('aria-label') === ${JSON.stringify(selectorText)});
    if (!el) return false; el.click(); return true;
  })()`);

async function uploadFile(file) {
  await p.goto(`${APP}/upload`, { settleMs: 2500 });
  await p.eval(
    `(() => { const i = document.getElementById('upload-bank'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, ${JSON.stringify(BANK)}); i.dispatchEvent(new Event('input', { bubbles: true })); })()`,
  );
  await p.send("DOM.enable");
  const { result } = await p.send("Runtime.evaluate", { expression: "document.querySelector('input[type=file]')" });
  await p.send("DOM.setFileInputFiles", { files: [join(FILES, file)], objectId: result.objectId });
  await waitFor(`toast de leitura de ${file}`, `document.body.innerText.includes(${JSON.stringify(file + " lido")})`);
}
async function openReviewOf(file) {
  // abre a importação em revisão desse arquivo e clica em "Revisar"
  await waitFor(
    `${file} lido e em revisão`,
    `[...document.querySelectorAll('button[aria-expanded]')].some(b => b.innerText.includes(${JSON.stringify(file)}) && b.innerText.includes('para revisar'))`,
  );
  await p.eval(`(() => {
    const t = [...document.querySelectorAll('button[aria-expanded]')].find(b => b.innerText.includes(${JSON.stringify(file)}) && b.innerText.includes('para revisar'));
    if (t && t.getAttribute('aria-expanded') !== 'true') t.click();
    window.__item = t?.closest('h3')?.parentElement;
  })()`);
  await sleep(500);
  await p.eval(`[...window.__item.querySelectorAll('a')].find(a => a.innerText.trim() === 'Revisar').click()`);
  await waitFor(
    "página de revisão",
    `location.pathname.startsWith('/review/') && document.body.innerText.includes('Confirmar')`,
  );
  await sleep(800);
}
async function confirmImport() {
  await p.eval(
    `[...document.querySelectorAll('button')].find(b => /^Confirmar \\d+ transa/.test(b.innerText.trim())).click()`,
  );
  await sleep(600);
  const asking = await p.eval(`!!document.querySelector('[role="dialog"]')`);
  if (asking) {
    await p.eval(
      `[...document.querySelectorAll('[role="dialog"] button')].filter(b => b.innerText.trim() && b.innerText.trim() !== 'Revisar antes' && b.getAttribute('aria-label') !== 'Fechar').pop().click()`,
    );
  }
  await waitFor("importação confirmada", `document.body.innerText.includes('Importação confirmada')`);
  return p.eval(
    `(() => { const h = [...document.querySelectorAll('p')].find(e => e.innerText === 'Importação confirmada'); return h.parentElement.innerText; })()`,
  );
}
async function octoberTransactions() {
  await p.goto(`${APP}/transactions`, { settleMs: 2500 });
  // Período: volta mês a mês até outubro de 2026
  (await click("Período")) ||
    (await p.eval(`[...document.querySelectorAll('button')].find(b => b.innerText.startsWith('Período')).click()`));
  for (let i = 0; i < 6; i++) {
    const label = await p.eval(
      `[...document.querySelectorAll('button')].find(b => b.innerText.startsWith('Período'))?.innerText ?? ''`,
    );
    if (/out/i.test(label) && /2026/.test(label)) break;
    await click("Mês anterior");
    await sleep(500);
  }
  await p.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await sleep(1200);
  return p.eval(
    `[...document.querySelectorAll('tbody tr')].map(r => r.innerText.replace(/\\s+/g, ' ').trim()).filter(t => t.includes(${JSON.stringify(BANK)}))`,
  );
}
async function simulateOldReaderBugs() {
  // "Leitor antigo": leu -1.234,56 como 0 e inventou uma linha a partir do rodapé.
  const user = await prisma.user.findUniqueOrThrow({ where: { email: process.env.DEMO_EMAIL } });
  const farm = await prisma.transaction.findFirstOrThrow({
    where: { userId: user.id, bank: BANK, description: "Farmacia Central" },
  });
  await prisma.transaction.update({
    where: { id: farm.id },
    data: { baseAmount: "0", amountEUR: "0", amountUSD: "0", amountBRL: "0", dedupeHash: "e2e-old-bug-farm" },
  });
  await prisma.transaction.create({
    data: {
      userId: user.id,
      uploadId: farm.uploadId,
      bank: BANK,
      date: new Date("2026-10-31T00:00:00Z"),
      description: "SALDO FINAL",
      type: "INCOME",
      baseCurrency: "EUR",
      baseAmount: "999",
      amountEUR: "999",
      amountUSD: "1100",
      amountBRL: "5800",
      dedupeHash: "e2e-old-bug-saldo",
    },
  });
}

try {
  // ── 1. primeira importação ────────────────────────────────────────────────
  await uploadFile("octubre.csv");
  await snap("upload-lido");
  await openReviewOf("octubre.csv");
  let t = await text();
  check(
    "1ª importação: sem aviso de reimportação",
    !t.includes("já foi importado") && !t.includes("já estão em Transações"),
  );
  await snap("revisao-primeira");
  let summary = await confirmImport();
  check("1ª importação: 3 transações gravadas", /3 novas/.test(summary), summary.split("\n")[1]);
  await snap("confirmada-primeira");

  // ── 2. decisão do usuário pela interface: categoria do Mercadona ──────────
  let rows = await octoberTransactions();
  check("Transações de outubro: 3 linhas", rows.length === 3, rows.join(" | "));
  const monthText = await text();
  check(
    "Filtro de outubro não traz lançamentos de 1º de novembro",
    !/, 1 nov/.test(monthText),
    (monthText.match(/\w+, 1 nov[^\n]*/) ?? [""])[0],
  );
  // O app aprende categorias com as escolhas do usuário: escolhe uma DIFERENTE da sugerida.
  const suggested = rows.find((r) => r.includes("Mercadona")) ?? "";
  const chosen = ["Compras", "Lazer", "Viagem"].find((c) => !suggested.includes(c));
  await p.eval(
    `[...document.querySelectorAll('tbody tr')].find(r => r.innerText.includes('Mercadona') && r.innerText.includes('TestBank E2E')).click()`,
  );
  await waitFor("painel da transação", `!!document.querySelector('[role="dialog"]')`);
  await p.eval(
    `[...document.querySelectorAll('[role="dialog"] button')].find(b => b.id && document.querySelector('label[for="'+b.id+'"]')?.innerText === 'Categoria').click()`,
  );
  await waitFor("lista de categorias", `!!document.querySelector('[cmdk-item]')`);
  await p.eval(
    `[...document.querySelectorAll('[cmdk-item]')].find(i => i.innerText.trim().startsWith(${JSON.stringify(chosen)})).click()`,
  );
  await sleep(400);
  await click("Salvar alterações");
  await waitFor("painel fechado e salvo", `!document.querySelector('[role="dialog"]')`);
  await sleep(800);
  rows = await octoberTransactions();
  check(
    `Categoria escolhida na interface: Mercadona → ${chosen}`,
    rows.some((r) => r.includes("Mercadona") && r.includes(chosen)),
    rows.find((r) => r.includes("Mercadona")),
  );
  await snap("transacoes-categoria-escolhida");

  // ── 3. simula leitor antigo com bugs e reenvia o MESMO arquivo ────────────
  await simulateOldReaderBugs();
  rows = await octoberTransactions();
  check(
    "Antes de reenviar: valor errado e linha inventada presentes",
    rows.some((r) => r.includes("SALDO FINAL")) && rows.some((r) => /Farmacia Central.*€ 0,00/.test(r)),
    rows.join(" | "),
  );
  await snap("transacoes-com-bugs");
  await uploadFile("octubre.csv");
  await openReviewOf("octubre.csv");
  t = await text();
  check("Reimportação: aviso 'já foi importado'", t.includes("Este arquivo já foi importado"));
  check(
    "Reimportação: plano corrige 1, mantém 2, remove 1",
    /corrigir 1 transação, manter 2 iguais e remover 1/.test(t),
    t.match(/Confirmar vai[^.]*\./)?.[0],
  );
  check("Linha corrigida em 'Precisam de revisão' com motivo", t.includes("Já importada; o arquivo corrige valor"));
  await snap("revisao-reimportacao");
  summary = await confirmImport();
  check(
    "Confirmação: 1 corrigida · 2 iguais · 1 removida",
    /1 corrigida · 2 iguais · 1 removida/.test(summary),
    summary.split("\n")[1],
  );
  await snap("confirmada-reimportacao");

  rows = await octoberTransactions();
  check("Sem duplicatas: 3 linhas", rows.length === 3, rows.join(" | "));
  check(
    "Valor corrigido: Farmacia −€ 1.234,56",
    rows.some((r) => /Farmacia Central.*1\.234,56/.test(r)),
  );
  check("Linha inventada removida", !rows.some((r) => r.includes("SALDO FINAL")));
  check(
    `Categoria escolhida pelo usuário mantida (${chosen})`,
    rows.some((r) => r.includes("Mercadona") && r.includes(chosen)),
    rows.find((r) => r.includes("Mercadona")),
  );
  await snap("transacoes-depois-reimportacao");

  await p.goto(`${APP}/upload`, { settleMs: 2500 });
  const imports = await p.eval(
    `[...document.querySelectorAll('button[aria-expanded]')].filter(b => b.innerText.includes('octubre.csv')).length`,
  );
  check("Só uma importação de octubre.csv na lista", imports === 1, `${imports}`);

  // ── 4. extrato sobreposto ─────────────────────────────────────────────────
  await uploadFile("octubre-sobreposto.csv");
  await openReviewOf("octubre-sobreposto.csv");
  t = await text();
  check("Sobreposto: aviso de linhas já gravadas", t.includes("Algumas linhas já estão em Transações"));
  // Outro arquivo é outra fonte: as 2 linhas em comum não entram e as de lá não são tocadas.
  check(
    "Sobreposto: plano cria 1 e pula 2 de outra fonte",
    /criar 1 nova e pular 2 que já estão em Transações por outra fonte/.test(t),
    t.match(/Confirmar vai[^.]*\./)?.[0],
  );
  await snap("revisao-sobreposto");
  summary = await confirmImport();
  check(
    "Sobreposto: 1 nova · 2 já estavam",
    /1 nova · 2 já estavam em Transações/.test(summary),
    summary.split("\n")[1],
  );
  rows = await octoberTransactions();
  check("Transações: 4 linhas (Glovo novo, sem duplicar)", rows.length === 4, rows.join(" | "));

  // ── 5. excluir só a importação sobreposta (Glovo fica) ───────────────────
  async function deleteImport(file, choice) {
    await p.goto(`${APP}/upload`, { settleMs: 2500 });
    await p.eval(`(() => {
      const t = [...document.querySelectorAll('button[aria-expanded]')].find(b => b.innerText.includes(${JSON.stringify(file)}) && b.innerText.includes('confirmad'));
      if (t.getAttribute('aria-expanded') !== 'true') t.click();
      window.__item = t.closest('h3').parentElement;
    })()`);
    await sleep(500);
    await p.eval(`[...window.__item.querySelectorAll('button')].find(b => b.innerText.trim() === 'Excluir').click()`);
    await waitFor("diálogo de exclusão", `!!document.querySelector('[role="dialog"]')`);
    const dialog = await p.eval(`document.querySelector('[role="dialog"]').innerText`);
    await snap(`dialogo-excluir-${file.replace(".csv", "")}`);
    await p.eval(
      `[...document.querySelectorAll('[role="dialog"] button')].find(b => b.innerText.trim().startsWith(${JSON.stringify(choice)})).click()`,
    );
    await waitFor("diálogo fechado", `!document.querySelector('[role="dialog"]')`);
    await sleep(1000);
    return dialog;
  }
  let dialog = await deleteImport("octubre-sobreposto.csv", "Só a importação");
  check(
    "Diálogo oferece as duas opções",
    dialog.includes("Só a importação") && dialog.includes("Excluir com 1 transação"),
  );
  rows = await octoberTransactions();
  check("'Só a importação': as 4 transações continuam", rows.length === 4, rows.join(" | "));

  // ── 6. excluir octubre.csv com as transações ──────────────────────────────
  dialog = await deleteImport("octubre.csv", "Excluir com");
  check("Diálogo mostra 'Excluir com 3 transações'", dialog.includes("Excluir com 3 transações"));
  rows = await octoberTransactions();
  check("'Excluir com transações': sobra só o Glovo", rows.length === 1 && rows[0].includes("Glovo"), rows.join(" | "));
  await snap("transacoes-so-glovo");

  // ── 7. excluir uma transação individual (Glovo) ───────────────────────────
  await p.eval(
    `[...document.querySelectorAll('tbody tr')].find(r => r.innerText.includes('Glovo') && r.innerText.includes('TestBank E2E')).click()`,
  );
  await waitFor("painel do Glovo", `!!document.querySelector('[role="dialog"]')`);
  await p.eval(
    `[...document.querySelectorAll('[role="dialog"] button')].find(b => b.innerText.trim() === 'Excluir').click()`,
  );
  await waitFor(
    "confirmar exclusão",
    `[...document.querySelectorAll('[role="dialog"]')].some(d => d.innerText.includes('Excluir transação?'))`,
  );
  await snap("dialogo-excluir-transacao");
  await p.eval(
    `[...document.querySelectorAll('[role="dialog"]')].find(d => d.innerText.includes('Excluir transação?')).querySelectorAll('button').forEach(b => { if (b.innerText.trim() === 'Excluir') b.click(); })`,
  );
  await sleep(1500);
  rows = await octoberTransactions();
  check("Transação individual excluída: outubro vazio", rows.length === 0, rows.join(" | "));

  // ── 8. excluir uma linha na revisão (não vai para Transações) ─────────────
  await uploadFile("descartar.csv");
  await openReviewOf("descartar.csv");
  await p.eval(
    `[...document.querySelectorAll('tbody tr')].find(r => r.innerText.includes('Saldo del dia')).querySelector('button[aria-label^="Excluir "]').click()`,
  );
  await waitFor(
    "diálogo de excluir linha",
    `[...document.querySelectorAll('[role="dialog"]')].some(d => d.innerText.includes('Excluir esta linha?'))`,
  );
  const delDialog = await p.eval(
    `[...document.querySelectorAll('[role="dialog"]')].find(d => d.innerText.includes('Excluir esta linha?')).innerText`,
  );
  check(
    "Diálogo diz que a linha não vai para Transações",
    delDialog.includes("não vai para Transações"),
    delDialog.replace(/\s+/g, " ").slice(0, 120),
  );
  await snap("dialogo-excluir-linha");
  await p.eval(
    `[...[...document.querySelectorAll('[role="dialog"]')].find(d => d.innerText.includes('Excluir esta linha?')).querySelectorAll('button')].find(b => b.innerText.trim() === 'Excluir').click()`,
  );
  await waitFor(
    "linha sumiu da revisão",
    `![...document.querySelectorAll('tbody tr')].some(r => r.innerText.includes('Saldo del dia')) && /Confirmar 1 transa/.test(document.body.innerText)`,
  );
  await waitFor("aviso de linha excluída", `document.body.innerText.includes('Linha excluída da importação')`);
  check("Revisão: sobra 1 linha para confirmar", true);
  summary = await confirmImport();
  check(
    "Confirmação: 1 nova",
    /^1 nova/.test(
      summary
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)[1] ?? "",
    ),
    summary.split("\n")[1],
  );
  rows = await octoberTransactions();
  check(
    "Transações: só a Panaderia, sem a linha excluída",
    rows.length === 1 && rows[0].includes("Panaderia Sol"),
    rows.join(" | "),
  );
  await snap("transacoes-sem-linha-excluida");

  // ── 9. avisos da leitura sempre à vista; arquivo inválido recusado antes de enviar ──
  await uploadFile("com-erro.csv");
  await p.goto(`${APP}/upload`, { settleMs: 2500 });
  const listLine = await p.eval(
    `[...document.querySelectorAll('button[aria-expanded]')].find(b => b.innerText.includes('com-erro.csv'))?.innerText ?? ''`,
  );
  check(
    "Lista: aviso da leitura no item da importação",
    /linha 3/.test(listLine),
    listLine.replace(/\s+/g, " ").slice(0, 140),
  );
  await snap("lista-com-aviso");
  await openReviewOf("com-erro.csv");
  t = await text();
  check(
    "Revisão: 'Avisos da leitura' com o número da linha",
    t.includes("Avisos da leitura") && /linha 3/.test(t),
    (t.match(/Avisos da leitura:[^\n]*\n?[^\n]*/) ?? [""])[0].replace(/\s+/g, " "),
  );
  await snap("revisao-com-aviso");
  await p.goto(`${APP}/upload`, { settleMs: 2500 });
  await p.send("DOM.enable");
  const fileInput = await p.send("Runtime.evaluate", { expression: "document.querySelector('input[type=file]')" });
  await p.send("DOM.setFileInputFiles", { files: [join(FILES, "contrato.docx")], objectId: fileInput.result.objectId });
  await waitFor("toast de arquivo recusado", `document.body.innerText.includes('contrato.docx não foi enviado')`);
  t = await text();
  check("Arquivo .docx recusado antes de enviar, com o motivo", t.includes("Formato não suportado"));
  const sentDocx = await prisma.upload.count({ where: { filename: "contrato.docx" } });
  check("…e nada foi enviado ao servidor", sentDocx === 0, `${sentDocx}`);
  await snap("docx-recusado");
} catch (err) {
  check("roteiro completo", false, err.message);
} finally {
  await cleanTestData().catch((e) => console.log("limpeza falhou:", e.message));
  await prisma.$disconnect();
  check("Sem erros no console do navegador", consoleErrors.length === 0, consoleErrors.slice(0, 3).join(" || "));
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\nRESULTADO: ${results.length - failed}/${results.length} verificações passaram`);
  await b.close();
  process.exit(failed ? 1 : 0);
}
