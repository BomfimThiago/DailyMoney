/**
 * Teste de ponta a ponta PELA INTERFACE com os extratos reais de fixtures/.
 *
 * Para cada CSV/XLSX/OFX/PDF em fixtures/ (fora do git): envia pela tela de importação sem
 * informar o banco, espera a leitura (PDF passa pela IA e leva minutos), confere a
 * revisão (quantidade de linhas, soma, nenhuma linha com saldo que não fecha), confirma,
 * confere o que foi gravado, reenvia o MESMO conteúdo com outro nome (tem de ser
 * reconhecido como já importado, sem criar nem remover nada) e exclui com as transações.
 *
 * Valores esperados por arquivo em fixtures/e2e-expected.json (também fora do git):
 *   { "files": { "<nome>": { "count": 34, "currency": "EUR", "sum": "234.24" } } }
 * Arquivo sem entrada lá roda só as verificações gerais.
 *
 * Requisitos: os mesmos de `npm run e2e:import` (Chrome, app no ar, usuário demo). Para
 * medir como em produção, suba o app com EXTRACTION_PROVIDER=ollama OLLAMA_MODEL=qwen2.5:3b.
 *
 *   npm run e2e:statements                  # todos os arquivos
 *   npm run e2e:statements -- revolut csv   # só os que contêm todos esses termos no nome
 *   E2E_SKIP_PDF_REIMPORT=1 npm run e2e:statements   # não relê os PDFs (economiza minutos)
 *
 * Imprime só contagens e somas (nada de descrições). Screenshots em
 * .e2e-output/import-statements/.
 */
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient, Prisma } from "@prisma/client";
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

const FIXTURES = "fixtures";
const OUT = ".e2e-output/import-statements";
const READ_TIMEOUT_MS = 12 * 60 * 1000; // PDF longo no qwen2.5:3b leva até ~4 min; folga para a máquina ocupada
const SKIP_PDF_REIMPORT = Boolean(process.env.E2E_SKIP_PDF_REIMPORT);
const terms = process.argv.slice(2).map((t) => t.toLowerCase());

const expected = existsSync(join(FIXTURES, "e2e-expected.json"))
  ? (JSON.parse(readFileSync(join(FIXTURES, "e2e-expected.json"), "utf8")).files ?? {})
  : {};
const files = readdirSync(FIXTURES)
  .filter((f) => /\.(csv|xlsx?|ofx|pdf)$/i.test(f))
  .filter((f) => terms.every((t) => f.toLowerCase().includes(t)))
  // CSVs primeiro: rápidos, mostram cedo se o fluxo da tela quebrou
  .sort((a, b) => Number(/\.pdf$/i.test(a)) - Number(/\.pdf$/i.test(b)) || a.localeCompare(b));
if (!files.length) {
  console.error(`Nenhum extrato em ${FIXTURES}/${terms.length ? ` com "${terms.join(" ")}"` : ""}.`);
  process.exit(2);
}

async function findApp() {
  const ports = [3000, 3001, 3002, 3003, 3004, 3005, 3100];
  const candidates = [process.env.E2E_BASE_URL, ...ports.map((n) => `http://localhost:${n}`)];
  for (const url of candidates.filter(Boolean)) {
    try {
      const r = await fetch(`${url}/login`, { signal: AbortSignal.timeout(4000) });
      if (r.ok && /<title>[^<]*Daily Money<\/title>/.test(await r.text())) return url.replace(/\/$/, "");
    } catch {}
  }
  console.error(
    `Não achei o daily-money em ${candidates.filter(Boolean).join(", ")}. Suba com \`npm run dev\` ou defina E2E_BASE_URL.`,
  );
  process.exit(2);
}
const APP = await findApp();
console.log(`daily-money em ${APP} · ${files.length} arquivo(s)\n`);

// Login da conta demo pela API (cookies nunca são impressos). O token de acesso expira
// em minutos e a rodada com PDFs leva meia hora: `api` refaz o login quando dá 401.
let cookies = [];
let cookieHeader = "";
async function signIn() {
  const login = await fetch(`${APP}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: process.env.DEMO_EMAIL, password: process.env.DEMO_PASSWORD }),
  });
  if (!login.ok) {
    console.error(
      login.status === 401
        ? "Login da conta demo recusado: rode o seed (scripts/seed-demo.ts)."
        : `Login falhou (HTTP ${login.status}).`,
    );
    process.exit(2);
  }
  cookies = login.headers.getSetCookie().map((c) => {
    const [pair] = c.split(";");
    const i = pair.indexOf("=");
    return { name: pair.slice(0, i), value: pair.slice(i + 1), url: APP };
  });
  cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
}
await signIn();
const api = async (path, init = {}, retry = true) => {
  const r = await fetch(`${APP}${path}`, { ...init, headers: { cookie: cookieHeader, ...(init.headers ?? {}) } });
  if (r.status === 401 && retry) {
    await signIn();
    return api(path, init, false);
  }
  if (!r.ok) throw new Error(`${init.method ?? "GET"} ${path}: HTTP ${r.status}`);
  return r.json();
};

const prisma = new PrismaClient();
const user = await prisma.user.findUniqueOrThrow({ where: { email: process.env.DEMO_EMAIL } });
const COPIES = mkdtempSync(join(tmpdir(), "dm-e2e-statements-"));
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

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

const results = [];
let shot = 0;
let current = "";
function check(name, ok, detail = "") {
  results.push({ file: current, name, ok, detail });
  console.log(`  ${ok ? "✔" : "✘"} ${name}${detail ? ` — ${detail}` : ""}`);
}
async function snap(name) {
  shot++;
  await p
    .screenshot({ path: `${OUT}/${String(shot).padStart(2, "0")}-${current.slice(0, 40)}-${name}.jpg` })
    .catch(() => undefined);
}
async function waitFor(desc, fn, timeoutMs = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try {
      if (await p.eval(fn)) return;
    } catch {}
    await sleep(300);
  }
  await snap(`FALHA-${desc.replace(/\W+/g, "-")}`);
  throw new Error(`timeout: ${desc}`);
}

const hashOf = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");
const dec = (v) => new Prisma.Decimal(v ?? 0);
const money = (v) => dec(v).toFixed(2);
function sums(rows) {
  const by = {};
  for (const r of rows) by[r.baseCurrency] = dec(by[r.baseCurrency]).plus(dec(r.baseAmount));
  return by;
}
const sumText = (by) =>
  Object.entries(by)
    .map(([c, v]) => `${c} ${money(v)}`)
    .join(" · ") || "—";

/** Remove do demo tudo o que veio deste conteúdo (de execuções anteriores ou desta). */
async function cleanup(hash) {
  const uploads = await prisma.upload.findMany({ where: { userId: user.id, contentHash: hash }, select: { id: true } });
  for (const u of uploads)
    await api(`/api/uploads/${u.id}?transactions=delete`, { method: "DELETE" }).catch(() => undefined);
}

/** Envia pela tela de importação (sem banco: o app tem de reconhecer) e espera terminar de ler. */
async function uploadViaUi(path, filename) {
  const before = new Set(
    (await prisma.upload.findMany({ where: { userId: user.id }, select: { id: true } })).map((u) => u.id),
  );
  await p.goto(`${APP}/upload`, { settleMs: 2500 });
  await p.send("DOM.enable");
  const { result } = await p.send("Runtime.evaluate", { expression: "document.querySelector('input[type=file]')" });
  await p.send("DOM.setFileInputFiles", { files: [path], objectId: result.objectId });
  await waitFor(
    `toast de envio de ${filename}`,
    `document.body.innerText.includes(${JSON.stringify(filename + " lido")}) || document.body.innerText.includes('Erro ao importar')`,
  );
  const t0 = Date.now();
  let upload = null;
  while (Date.now() - t0 < READ_TIMEOUT_MS) {
    upload = await prisma.upload.findFirst({
      where: { userId: user.id, filename, id: { notIn: [...before] } },
      orderBy: { createdAt: "desc" },
    });
    if (upload && (upload.status === "STAGED" || upload.status === "FAILED")) break;
    await sleep(3000);
  }
  // a lista da tela tem de refletir o resultado (ela se atualiza sozinha enquanto lê)
  if (upload?.status === "STAGED") {
    await waitFor(
      "importação 'para revisar' na lista",
      `[...document.querySelectorAll('button[aria-expanded]')].some(b => b.innerText.includes(${JSON.stringify(filename)}) && b.innerText.includes('para revisar'))`,
      20000,
    ).catch(() => check("Lista de importações mostra 'para revisar'", false));
  }
  return { upload, seconds: Math.round((Date.now() - t0) / 1000) };
}

async function openReview(uploadId) {
  await p.goto(`${APP}/review/${uploadId}`, { settleMs: 2000 });
  await waitFor("página de revisão", `/Confirmar \\d+ transa/.test(document.body.innerText)`, 60000);
  await sleep(800);
}
async function confirmImport() {
  await p.eval(
    `[...document.querySelectorAll('button')].find(b => /^Confirmar \\d+ transa/.test(b.innerText.trim())).click()`,
  );
  await sleep(600);
  if (await p.eval(`!!document.querySelector('[role="dialog"]')`)) {
    await p.eval(
      `[...document.querySelectorAll('[role="dialog"] button')].filter(b => b.innerText.trim() && b.innerText.trim() !== 'Revisar antes' && b.getAttribute('aria-label') !== 'Fechar').pop().click()`,
    );
  }
  await waitFor("importação confirmada", `document.body.innerText.includes('Importação confirmada')`, 120000);
  const box = await p.eval(
    `(() => { const h = [...document.querySelectorAll('p')].find(e => e.innerText === 'Importação confirmada'); return h.parentElement.innerText; })()`,
  );
  // linha logo abaixo do título: "108 novas." / "34 iguais." / "Nada mudou."
  return (
    box
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)[1] ?? ""
  );
}
async function deleteViaUi(filename) {
  await p.goto(`${APP}/upload`, { settleMs: 2500 });
  await p.eval(`(() => {
    const t = [...document.querySelectorAll('button[aria-expanded]')].find(b => b.innerText.includes(${JSON.stringify(filename)}) && b.innerText.includes('confirmad'));
    if (t.getAttribute('aria-expanded') !== 'true') t.click();
    window.__item = t.closest('h3').parentElement;
  })()`);
  await sleep(500);
  await p.eval(`[...window.__item.querySelectorAll('button')].find(b => b.innerText.trim() === 'Excluir').click()`);
  await waitFor("diálogo de exclusão", `!!document.querySelector('[role="dialog"]')`);
  const dialog = await p.eval(`document.querySelector('[role="dialog"]').innerText`);
  await p.eval(
    `[...document.querySelectorAll('[role="dialog"] button')].find(b => b.innerText.trim().startsWith('Excluir com')).click()`,
  );
  await waitFor("diálogo fechado", `!document.querySelector('[role="dialog"]')`);
  await sleep(1000);
  return dialog;
}

const SIGN_OR_BALANCE = /saldo não confere|confira se é entrada ou saída|valor não aparece no extrato/;
const summaryRows = [];

for (const file of files) {
  current = file;
  const exp = expected[file];
  const isPdf = /\.pdf$/i.test(file);
  const path = join(FIXTURES, file);
  const hash = hashOf(path);
  console.log(`━━ ${file}${exp ? "" : "  (sem valores esperados)"}`);
  const row = { file, bank: "—", read: "—", count: "—", sum: "—", warnings: "—", reimport: "—" };
  summaryRows.push(row);
  try {
    await cleanup(hash);

    // ── 1. envio e leitura ───────────────────────────────────────────────────
    const { upload, seconds } = await uploadViaUi(join(process.cwd(), path), file);
    row.read = `${seconds}s`;
    if (!upload || upload.status !== "STAGED") {
      check(
        "Leitura terminou em revisão",
        false,
        upload ? `${upload.status}: ${upload.error ?? ""}`.slice(0, 200) : "timeout",
      );
      await snap("falhou-leitura");
      continue;
    }
    check("Leitura terminou em revisão", true, `${seconds}s`);
    const warnings = (upload.error ?? "").trim();
    row.warnings = warnings ? (warnings.match(/descartadas|não leu/g) ?? ["sim"]).length : 0;
    if (warnings)
      console.log(
        `    aviso na importação: ${warnings.length > 120 ? `${warnings.slice(0, 120)}…` : warnings}`.replace(
          /«[^»]*»?/g,
          "«…»",
        ),
      );

    const staged = await prisma.stagedTransaction.findMany({ where: { uploadId: upload.id } });
    const stagedSums = sums(staged);
    const banks = [...new Set(staged.map((r) => r.bank ?? ""))];
    // CSV: pelo cabeçalho de bancos conhecidos; OFX: do arquivo; PDF: do texto ou da IA.
    if (exp?.bank !== undefined) {
      check(
        `Banco reconhecido: ${exp.bank ?? "nenhum (o extrato não diz)"}`,
        banks.length === 1 && (banks[0] || null) === exp.bank,
        banks.join(", ") || "vazio",
      );
    }
    row.bank = banks.join(", ");
    row.count = staged.length;
    row.sum = sumText(stagedSums);
    if (exp) {
      check(`Revisão: ${exp.count} linhas`, staged.length === exp.count, `${staged.length}`);
      const other = Object.keys(stagedSums).filter((c) => c !== exp.currency);
      check(
        `Revisão: soma ${exp.currency} ${exp.sum}`,
        money(stagedSums[exp.currency]) === dec(exp.sum).toFixed(2) && !other.length,
        sumText(stagedSums),
      );
    } else {
      check("Revisão: tem linhas", staged.length > 0, `${staged.length}`);
    }
    const bad = staged.filter((s) => SIGN_OR_BALANCE.test(s.reviewReason ?? ""));
    check(
      "Nenhuma linha com saldo/sinal duvidoso",
      bad.length === 0,
      bad.length ? `${bad.length}: ${[...new Set(bad.map((s) => s.reviewReason))].join("; ")}` : "",
    );

    // ── 2. revisão e confirmação pela tela ──────────────────────────────────
    await openReview(upload.id);
    const reviewText = await p.eval(`document.body.innerText`);
    check(
      "Revisão: sem aviso de reimportação na 1ª vez",
      !reviewText.includes("já foi importado") && !reviewText.includes("já estão em Transações"),
    );
    check(
      `Botão confirma ${staged.length} transações`,
      reviewText.includes(`Confirmar ${staged.length} transa`),
      (reviewText.match(/Confirmar \d+ transa\S*/) ?? [""])[0],
    );
    await snap("revisao");
    const summary = await confirmImport();
    check(`Confirmação: ${staged.length} novas`, summary.startsWith(`${staged.length} nova`), summary);
    await snap("confirmada");

    const tx = await prisma.transaction.findMany({ where: { userId: user.id, uploadId: upload.id } });
    check("Transações gravadas = linhas revisadas", tx.length === staged.length, `${tx.length}`);
    check("Soma gravada = soma revisada", sumText(sums(tx)) === sumText(stagedSums), sumText(sums(tx)));
    const txIds = tx.map((t) => t.id);

    // ── 3. mesmo conteúdo, outro nome: tem de reconhecer e não duplicar ─────
    if (isPdf && SKIP_PDF_REIMPORT) {
      row.reimport = "pulado";
    } else {
      const copyName = `copia-${file}`;
      copyFileSync(path, join(COPIES, copyName));
      const again = await uploadViaUi(join(COPIES, copyName), copyName);
      if (!again.upload || again.upload.status !== "STAGED") {
        check(
          "Reimportação: leitura terminou em revisão",
          false,
          again.upload ? `${again.upload.status}: ${again.upload.error ?? ""}`.slice(0, 200) : "timeout",
        );
        row.reimport = "falhou a leitura";
      } else {
        const { plan } = await api(`/api/uploads/${again.upload.id}/staged`);
        await openReview(again.upload.id);
        const t = await p.eval(`document.body.innerText`);
        check("Reimportação: aviso 'já foi importado'", t.includes("Este arquivo já foi importado"));
        const planText = (t.match(/Confirmar vai[^.]*\.|Confirmar não muda nada\./) ?? [""])[0];
        const ok = plan && plan.create === 0 && plan.remove === 0 && (isPdf || plan.same === tx.length);
        check(
          isPdf ? "Reimportação: nada novo, nada removido" : `Reimportação: mantém as ${tx.length} iguais`,
          Boolean(ok),
          planText || JSON.stringify(plan),
        );
        await snap("revisao-reimportacao");
        const s2 = await confirmImport();
        check("Reimportação confirmada sem criar nada", !/\d+ nova/.test(s2), s2);
        const now = await prisma.transaction.findMany({ where: { userId: user.id, upload: { contentHash: hash } } });
        check("Sem duplicatas depois de reimportar", now.length === tx.length, `${now.length}`);
        check(
          "Mesmas transações (nenhuma recriada)",
          now.every((n) => txIds.includes(n.id)),
        );
        const uploads = await prisma.upload.count({ where: { userId: user.id, contentHash: hash } });
        check("Uma importação só desse conteúdo", uploads === 1, `${uploads}`);
        row.reimport = plan ? `+${plan.create} ~${plan.update} =${plan.same} −${plan.remove}` : "?";
      }
    }

    // ── 4. excluir com as transações, pela tela ─────────────────────────────
    const last = await prisma.upload.findFirst({ where: { userId: user.id, contentHash: hash, status: "COMMITTED" } });
    const dialog = await deleteViaUi(last.filename);
    check(
      `Diálogo oferece excluir com ${tx.length} transações`,
      dialog.includes(`Excluir com ${tx.length} transa`),
      (dialog.match(/Excluir com \d+ \S+/) ?? [""])[0],
    );
    const left = await prisma.transaction.count({ where: { id: { in: txIds } } });
    check("Excluído com as transações", left === 0, `${left} restantes`);
  } catch (err) {
    check("roteiro completo", false, err.message);
  } finally {
    await cleanup(hash).catch(() => undefined);
    console.log("");
  }
}

await prisma.$disconnect();
current = "";
check("Sem erros no console do navegador", consoleErrors.length === 0, consoleErrors.slice(0, 3).join(" || "));
await b.close();
rmSync(COPIES, { recursive: true, force: true });

console.log(
  "\narquivo                                                      banco        leitura  linhas  soma                 avisos  reimportação (+novas ~corrigidas =iguais −removidas)",
);
for (const r of summaryRows) {
  console.log(
    `${r.file.padEnd(60)} ${String(r.bank).padEnd(12)} ${String(r.read).padStart(7)}  ${String(r.count).padStart(6)}  ${String(r.sum).padEnd(20)} ${String(r.warnings).padStart(6)}  ${r.reimport}`,
  );
}
const failed = results.filter((r) => !r.ok);
if (failed.length) {
  console.log("\nFALHAS:");
  for (const f of failed) console.log(`  ${f.file || "geral"}: ${f.name}${f.detail ? ` — ${f.detail}` : ""}`);
}
console.log(`\nRESULTADO: ${results.length - failed.length}/${results.length} verificações passaram`);
process.exit(failed.length ? 1 : 0);
