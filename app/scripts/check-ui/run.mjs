// UI check for the web build: opens every screen with sample data at phone size and at
// computer size, saves screenshots, fails on page errors and on blank frames when
// switching tabs.
//   VIEWPORT=1440x900 npm run check:ui   only one size
//   npm run check:ui              build the web app, then check it
//   DIST=dist npm run check:ui    reuse an existing build
// Screenshots go to $OUT (default: <tmp>/dailymoney-check-ui). Look at them before
// calling a UI change done.
import { Buffer } from 'node:buffer';
import { execSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { cardPurchases, fixtures, month } from './fixtures.mjs';

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const out = process.env.OUT ?? path.join(os.tmpdir(), 'dailymoney-check-ui');
fs.mkdirSync(out, { recursive: true });

// Playwright is not an app dependency: use the one installed globally (cloud sessions, CI).
function loadPlaywright() {
  const require = createRequire(import.meta.url);
  try {
    return require('playwright');
  } catch {
    const globalRoot = execSync('npm root -g').toString().trim();
    return require(path.join(globalRoot, 'playwright'));
  }
}

let dist = process.env.DIST && path.resolve(appDir, process.env.DIST);
if (!dist) {
  dist = path.join(os.tmpdir(), 'dailymoney-check-ui-dist');
  const build = spawnSync('npx', ['expo', 'export', '--platform', 'web', '--output-dir', dist], {
    cwd: appDir,
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  if (build.status !== 0) process.exit(build.status ?? 1);
}

const types = {
  '.js': 'application/javascript',
  '.html': 'text/html',
  '.css': 'text/css',
  '.png': 'image/png',
  '.ttf': 'font/ttf',
  '.ico': 'image/x-icon',
};
const server = http
  .createServer((req, res) => {
    let file = path.join(dist, decodeURIComponent(req.url.split('?')[0]));
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory())
      file = path.join(dist, 'index.html');
    res.setHeader('content-type', types[path.extname(file)] ?? 'application/octet-stream');
    fs.createReadStream(file).pipe(res);
  })
  .listen(0);
const base = `http://localhost:${server.address().port}`;

// Once the pending Pix is answered, the API stops listing it, like the real one.
let answered = false;
let approved = false;
// Category changes the screens sent (PATCH /transactions/{id}).
const recategorized = [];

const bankRequests = [];
// The family's month start day, as saved from Ajustes (PATCH /family).
let monthStartDay = 1;

// The dashboard's days with a month starting on the 16th or later: from that day of the
// month before up to the day before it this month.
function shiftedDashboard(body) {
  const pad = (n) => String(n).padStart(2, '0');
  const [y, m] = body.month.split('-').map(Number);
  const startDate = new Date(Date.UTC(y, m - 2, monthStartDay));
  const endDate = new Date(Date.UTC(y, m - 1, monthStartDay - 1));
  const iso = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  const days = Math.round((endDate - startDate) / 86_400_000) + 1;
  const fit = (list) => Array.from({ length: days }, (_, i) => list[i] ?? '0.00');
  return {
    ...body,
    start: iso(startDate),
    end: iso(endDate),
    currencies: body.currencies.map((c) => ({
      ...c,
      daily: fit(c.daily),
      previous_daily: fit(c.previous_daily),
    })),
  };
}

// The list's lines with the search and filters of the URL, like the real API.
function listed(url) {
  const get = (k) => url.searchParams.get(k);
  const q = (get('q') ?? '').toLowerCase();
  const member = get('member');
  const currencyOf = (t) => fixtures['/accounts'].find((a) => a.id === t.account_id)?.currency;
  const out = get('direction') === 'out';
  const items = fixtures.regular.items.filter(
    (t) =>
      t.description.toLowerCase().includes(q) &&
      (!get('category_id') || t.category_id === get('category_id')) &&
      (!get('account_id') || t.account_id === get('account_id')) &&
      (!member || (member === 'casa' ? t.member_id === null : t.member_id === member)) &&
      (!get('direction') || Number(t.amount) < 0 === out) &&
      (!get('account_currency') || currencyOf(t) === get('account_currency')) &&
      (!get('date_from') || t.date >= get('date_from')) &&
      (!get('date_to') || t.date <= get('date_to')),
  );
  const sort = get('sort');
  if (!sort) return items;
  const desc = sort.startsWith('-');
  const key = sort.replace('-', '');
  const value = (t) => (key === 'amount' ? Number(t.amount) : t.description.toLowerCase());
  return [...items].sort((a, b) => (value(a) < value(b) ? -1 : 1) * (desc ? -1 : 1));
}

// A line in the three currencies (the samples: one euro is 6 reais or 1.2 dollars).
function inCurrencies(id) {
  const queued = fixtures['/transactions/review'].groups.flatMap((g) => g.items);
  const t = [...fixtures.regular.items, ...queued].find((x) => x.id === id);
  if (!t) return null;
  const perEur = { EUR: 1, BRL: 6, USD: 1.2 };
  const amounts = ['BRL', 'EUR', 'USD'].map((c) => {
    const rate = perEur[c] / perEur[t.currency];
    return { currency: c, amount: (Number(t.amount) * rate).toFixed(4), rate: rate.toFixed(8) };
  });
  return { currency: t.currency, rate_date: t.date, amounts };
}

// The totals the API answers for those lines (amounts already in BRL in the samples).
function totals(items) {
  const names = Object.fromEntries(fixtures['/family'].members.map((m) => [m.id, m.name]));
  const sum = (lines, id, name) => {
    let income = 0;
    let spending = 0;
    for (const t of lines) {
      const v = Number(t.display_amount ?? t.amount);
      if (v > 0) income += v;
      else spending -= v;
    }
    return {
      id,
      name,
      income: income.toFixed(2),
      spending: spending.toFixed(2),
      count: lines.length,
    };
  };
  const by = (key, nameOf) => {
    const groups = new Map();
    for (const t of items) groups.set(t[key], [...(groups.get(t[key]) ?? []), t]);
    return [...groups]
      .map(([id, lines]) => sum(lines, id, nameOf(lines[0])))
      .sort((a, b) => b.spending - a.spending || b.income - a.income);
  };
  const all = sum(items, null, '');
  if (!items.length) return { count: 0, currencies: [] };
  return {
    count: items.length,
    currencies: [
      {
        currency: 'BRL',
        income: all.income,
        spending: all.spending,
        balance: (all.income - all.spending).toFixed(2),
        count: items.length,
        categories: by('category_id', (t) => t.category_name ?? 'Sem categoria'),
        members: by('member_id', (t) => names[t.member_id] ?? 'Casa'),
        accounts: by('account_id', (t) => t.account_name),
        days: [...new Set(items.map((t) => t.date))].map((date) => {
          const day = sum(
            items.filter((t) => t.date === date),
            null,
            '',
          );
          return { date, total: (day.income - day.spending).toFixed(2) };
        }),
      },
    ],
  };
}

function answer(url, method) {
  const p = url.pathname.replace(/^\/api\/v1/, '');
  if (method === 'PUT' && p.endsWith('/kind')) {
    answered = true;
    return { status: 200, body: {} };
  }
  if (method === 'PATCH' && p.startsWith('/transactions/')) {
    recategorized.push(p.split('/').pop());
    return { status: 200, body: {} };
  }
  if (method === 'POST' && p.startsWith('/imports/') && p.endsWith('/undo')) {
    return { status: 200, body: { removed: 42 } };
  }
  if (method === 'DELETE' && p === '/transactions') {
    return { status: 200, body: { removed: 312 } };
  }
  if (method === 'POST' && p === '/connections/conn-wise/sync') {
    const connection = fixtures['/connections'].connections[0];
    const accounts = [{ name: 'Wise EUR', new: 4, duplicate: 2, error: null }];
    return { status: 200, body: { connection, accounts } };
  }
  if (method === 'POST' && p === '/connections/brazil') {
    // The key for Pluggy's window; Pluggy's library reads it as a signed token.
    const part = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const key = `${part({ alg: 'none' })}.${part({ clientId: 'exemplo' })}.x`;
    return { status: 200, body: { connect_token: key, connector_id: 200 } };
  }
  if (method === 'POST' && p === '/connections/brazil/finish') {
    // Back from Meu Pluggy with Nubank authorized and read.
    const connection = fixtures['/connections'].connections[1];
    const accounts = [{ name: 'Nubank', new: 37, duplicate: 5, error: null }];
    return { status: 200, body: { status: 'connected', results: [{ connection, accounts }] } };
  }
  if (method === 'POST' && p === '/transactions/review') {
    approved = true;
    return { status: 200, body: { count: 3, left: 0 } };
  }
  if (approved && p === '/transactions/review') {
    return { status: 200, body: { total: 0, groups: [] } };
  }
  if (method === 'PATCH' && p.startsWith('/accounts/')) {
    const account = fixtures['/accounts'].find((a) => a.id === p.split('/').pop());
    return { status: 200, body: account };
  }
  if (method === 'PATCH' && p === '/family') {
    monthStartDay = 27;
    return { status: 200, body: { ...fixtures['/auth/me'].family, month_start_day: 27 } };
  }
  if (p === '/auth/me') {
    const me = fixtures[p];
    return {
      status: 200,
      body: { ...me, family: { ...me.family, month_start_day: monthStartDay } },
    };
  }
  if (monthStartDay !== 1 && p === '/transactions/dashboard') {
    return { status: 200, body: shiftedDashboard(fixtures[p]) };
  }
  if (p === '/bank-requests') {
    if (method === 'POST') {
      bankRequests.push({ id: `r-${bankRequests.length}`, bank_name: 'Santander', note: null });
      return { status: 201, body: bankRequests.at(-1) };
    }
    return { status: 200, body: bankRequests };
  }
  if ((answered || approved) && p === '/transactions/summary') {
    const body = { ...fixtures[p] };
    if (answered) body.pending_transfers = 0;
    if (approved) body.to_review = 0;
    return { status: 200, body };
  }
  if (answered && p === '/transactions/transfers') {
    return { status: 200, body: { ...fixtures[p], pending: [] } };
  }
  if (p === '/transactions/latest-month') return { status: 200, body: { month } };
  if (p.endsWith('/currencies')) {
    const body = inCurrencies(p.split('/')[2]);
    return body ? { status: 200, body } : { status: 404, body: {} };
  }
  if (p === '/transactions' && url.searchParams.get('card_bill')) {
    const items = cardPurchases[url.searchParams.get('card_bill')] ?? [];
    return { status: 200, body: { total: items.length, items } };
  }
  if (p === '/transactions' && url.searchParams.getAll('kind').includes('regular')) {
    const waiting = url.searchParams.getAll('kind').includes('pending');
    const items = [...listed(url), ...(waiting ? fixtures['/transactions/transfers'].pending : [])];
    return { status: 200, body: { total: items.length, items } };
  }
  if (p === '/transactions/totals') return { status: 200, body: totals(listed(url)) };
  if (p in fixtures) return { status: 200, body: fixtures[p] };
  return { status: 404, body: { detail: `sem dado de exemplo para ${p}` } };
}

const problems = [];
const shots = [];
const { chromium } = loadPlaywright();
const browser = await chromium.launch();
const sizes = process.env.VIEWPORT ? [process.env.VIEWPORT] : ['390x844', '1440x900'];

for (const size of sizes) {
  answered = false;
  approved = false;
  recategorized.length = 0;
  const [vw, vh] = size.split('x').map(Number);
  // Below 900 px the app is in phone layout; above, it has the sidebar.
  const tag = vw < 900 ? 'celular' : 'computador';
  const page = await browser.newPage({ viewport: { width: vw, height: vh } });
  await checkScreens(page, tag);
  await page.close();
}
await browser.close();
server.close();

async function checkScreens(page, tag) {
  const flag = (text) => problems.push(`[${tag}] ${text}`);
  page.on('pageerror', (e) => flag(`erro na página: ${e.message}`));
  // The browser logs the signed-out 401 below; that one is expected.
  const expected = (text) => text.includes('status of 401');
  page.on('console', (m) => {
    if (m.type() === 'error' && !expected(m.text())) flag(`console: ${m.text()}`);
  });
  // Pluggy's window is served by Pluggy; here a plain page stands in for it.
  await page.route('https://connect.pluggy.ai/**', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<body style="font-family:sans-serif;background:#fff;padding:24px">Janela da Pluggy (exemplo)</body>',
    }),
  );
  await page.route('**/api/v1/**', async (route) => {
    const req = route.request();
    // Like the real API: without a token nobody is signed in, so the login page shows.
    const signedOut = !req.headers().authorization;
    const { status, body } = signedOut
      ? { status: 401, body: { detail: 'Não autenticado' } }
      : answer(new URL(req.url()), req.method());
    if (status === 404) flag(`API sem exemplo: ${req.method()} ${new URL(req.url()).pathname}`);
    await new Promise((r) => setTimeout(r, 150)); // a little latency, like the real API
    await route.fulfill({ status, json: body });
  });

  // Envios anteriores: Desfazer asks before taking a statement back.
  async function checkUndo() {
    await page
      .getByRole('button', { name: 'Desfazer', exact: true })
      .filter({ visible: true })
      .first()
      .click();
    await page
      .getByText(/Sai o envio e 42 transações/)
      .filter({ visible: true })
      .first()
      .waitFor();
    await shot('upload-desfazer');
    await page.getByRole('button', { name: 'Manter' }).filter({ visible: true }).click();
  }

  async function shot(name) {
    const file = path.join(out, `${tag}-${name}.png`);
    await page.screenshot({ path: file, fullPage: true });
    shots.push(file);
  }

  async function noBlankWhile(label, action) {
    await action();
    for (let i = 0; i < 15; i++) {
      const text = (await page.locator('body').innerText()).trim();
      const loading = await page.locator('[role=progressbar]:visible').count();
      if (text.length < 40 || loading) {
        flag(`${label}: tela vazia ou carregando ao trocar de aba`);
        return;
      }
      await page.waitForTimeout(40);
    }
  }

  try {
    // Signed out: login screen.
    await page.goto(`${base}/login`);
    await page.waitForLoadState('networkidle');
    await shot('login');

    // Signed in from here on.
    await page.evaluate(() => localStorage.setItem('dm.access', 'token-de-exemplo'));
    await page.goto(`${base}/`);
    await page.getByText(tag === 'celular' ? 'Últimos movimentos' : 'RITMO DO MÊS').waitFor();
    await page.waitForLoadState('networkidle');
    await shot('inicio');
    // Further down Início: the spending split by person and the month's flow.
    await page.getByRole('radio', { name: 'Pessoa' }).filter({ visible: true }).first().click();
    const flow = page.getByText('FLUXO DO MÊS').filter({ visible: true }).first();
    await flow.scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    await shot('inicio-fluxo');
    await page.getByRole('radio', { name: 'Categoria' }).filter({ visible: true }).first().click();

    // Further down still: the last months (what used to be the Análises page).
    await page.getByText('COBRANÇAS QUE SE REPETEM').filter({ visible: true }).first().waitFor();
    // Scrolled so the section's title sits at the top of the screen.
    await page
      .getByText('Últimos meses')
      .filter({ visible: true })
      .first()
      .evaluate((el) => el.scrollIntoView({ block: 'start' }));
    await page.waitForTimeout(200);
    await shot('inicio-ultimos-meses');

    // Tabs stay mounted, so the same text can exist on a hidden tab: wait for the visible one.
    const seen = (text) => page.getByText(text).filter({ visible: true }).first();
    // Bottom tabs on a phone, sidebar links on a computer: both carry the same test id.
    const tab = (name) => page.getByTestId(`tab-${name}`);
    // Investimentos: only the bank's portfolio.
    await tab('Investimentos').click();
    await seen(tag === 'computador' ? 'SEUS INVESTIMENTOS' : 'Seus investimentos').waitFor();
    await shot('investimentos');

    await tab('Transações').click();
    await seen('Pão de Açúcar').waitFor();
    await shot('transacoes-lista');

    // Filtering adds up only what is left, grouped by what was filtered: by Responsável
    // on a computer, by category on a phone.
    const [menu, pick, back] =
      tag === 'computador'
        ? ['Responsável', 'Ana', 'Responsável: Ana']
        : ['Categoria', 'Mercado', 'Mercado'];
    await seen(`${menu} ▾`).click();
    await page.getByRole('menuitem', { name: pick, exact: true }).filter({ visible: true }).click();
    await seen('TOTAL DO QUE ESTÁ FILTRADO')
      .waitFor({ timeout: 3000 })
      .catch(() => flag('o total não seguiu o filtro'));
    await page.waitForLoadState('networkidle');
    await page.getByTestId('totals').filter({ visible: true }).waitFor();
    await seen(tag === 'computador' ? 'Salário' : 'Pão de Açúcar').waitFor();
    await shot('transacoes-filtro');
    await seen(`${back} ▾`).click();
    await page
      .getByRole('menuitem', { name: 'Todas', exact: true })
      .filter({ visible: true })
      .click();
    await seen('TOTAL DO MÊS').waitFor();

    // Study like the old app: all the time there is, only gastos, biggest first.
    const item = (name) =>
      page.getByRole('menuitem', { name, exact: true }).filter({ visible: true });
    await seen(tag === 'computador' ? 'Período: Mês ▾' : 'Mês ▾').click();
    await item('Todo o período').click();
    await seen('TOTAL DO PERÍODO').waitFor();
    await seen('Tipo ▾').click();
    await item('Gastos').click();
    if (tag === 'computador') {
      await page.getByLabel('Ordenar por valor').filter({ visible: true }).click();
      await seen('VALOR ↑').waitFor();
    } else {
      await seen('Por dia ▾').click();
      await item('Maiores gastos').click();
    }
    await page.waitForLoadState('networkidle');
    await seen('✕ Limpar filtros').waitFor();
    await page.getByTestId('totals').filter({ visible: true }).waitFor();
    await shot('transacoes-estudo');
    // One tap undoes the filters and the period.
    await seen('✕ Limpar filtros').click();
    if (tag === 'computador') {
      await page.getByLabel('Ordenar por valor').filter({ visible: true }).click();
      await page.getByLabel('Ordenar por valor').filter({ visible: true }).click();
    } else {
      await seen('Maiores gastos ▾').click();
      await item('Por dia').click();
    }
    await seen('TOTAL DO MÊS')
      .waitFor({ timeout: 3000 })
      .catch(() => flag('Limpar filtros não voltou para o mês'));

    // A line opens its detail (beside the table, or as a sheet on a phone), where the
    // category can change.
    // By role: Início, mounted underneath, also shows this line as plain text.
    await page
      .getByRole('button', { name: /^Pão de Açúcar/ })
      .filter({ visible: true })
      .first()
      .click();
    const button = (name) =>
      page.getByRole('button', { name, exact: true }).filter({ visible: true });
    const fields = () => page.getByLabel('Descrição', { exact: true }).filter({ visible: true });
    // Summary and fields together: no extra Editar step.
    await fields().waitFor();
    await page.waitForTimeout(400); // the sheet fades in
    await shot('transacoes-detalhe');
    if (await button('Editar').count()) flag('o detalhe ainda pede para apertar Editar');
    // Only the chosen category shows; the list opens from the dropdown.
    if (
      await page.getByRole('menuitem', { name: 'Restaurantes' }).filter({ visible: true }).count()
    ) {
      flag('o detalhe ainda mostra todas as categorias');
    }
    await button('Categoria').click();
    await page.getByRole('menuitem', { name: 'Restaurantes' }).filter({ visible: true }).waitFor();
    await shot('transacoes-editar-categoria');
    // A click elsewhere closes the open list.
    await seen('Esta linha é').click();
    await page
      .getByRole('menuitem', { name: 'Restaurantes' })
      .filter({ visible: true })
      .waitFor({ state: 'detached', timeout: 3000 })
      .catch(() => flag('a lista de categorias não fecha ao clicar fora'));
    await button('Categoria').click();
    await page.getByRole('menuitem', { name: 'Restaurantes' }).filter({ visible: true }).click();
    await seen('Valer também para as próximas deste estabelecimento').waitFor();
    await button('Salvar').click();
    await seen('Alterações salvas.').waitFor();
    if (recategorized.length !== 1) flag('trocar a categoria não chamou a API');
    // The line's Responsável: anyone in the family, or the household.
    await button('Responsável').click();
    await page.getByRole('menuitem', { name: 'Ana' }).filter({ visible: true }).waitFor();
    await shot('transacoes-responsavel');
    await page.getByRole('menuitem', { name: 'Ana' }).filter({ visible: true }).click();
    await button('Salvar').click();
    await seen('Alterações salvas.').waitFor();
    if (recategorized.length !== 2) flag('trocar o responsável não chamou a API');
    // The question before deleting.
    await button('Excluir').click();
    await seen('Excluir esta transação?').waitFor();
    await shot('transacoes-excluir');
    await button('Cancelar').click();
    await fields().waitFor();
    if (tag === 'celular') {
      await page.getByRole('button', { name: 'Fechar', exact: true }).click();
      await fields()
        .waitFor({ state: 'detached', timeout: 3000 })
        .catch(() => flag('a folha de detalhe não fechou'));
    } else {
      // Search narrows the table.
      await page.getByLabel('Buscar descrição').fill('netf');
      await page
        .getByText('Uber', { exact: true })
        .filter({ visible: true })
        .waitFor({ state: 'detached', timeout: 3000 })
        .catch(() => flag('a busca não filtrou a tabela'));
      await shot('transacoes-busca');
      await page.getByLabel('Buscar descrição').fill('');
      await seen('Uber').waitFor();
      // A line far down the table is edited where it is: the panel follows the scroll.
      const size = page.viewportSize();
      await page.setViewportSize({ width: size.width, height: 560 });
      const last = page
        .getByRole('button', { name: /^Aluguel/ })
        .filter({ visible: true })
        .first();
      await last.scrollIntoViewIfNeeded();
      await last.click();
      await page.waitForTimeout(300);
      const box = await fields().boundingBox();
      if (!box || box.y < 0 || box.y + box.height > 560) {
        flag('o detalhe não acompanha a rolagem da tabela');
      }
      await shot('transacoes-detalhe-rolado');
      await page.setViewportSize(size);
    }
    // No Transferências tab: the switch shows them in the list, the waiting ones on top.
    const transfersSwitch = page
      .getByRole('checkbox', { name: 'Transferências internas' })
      .filter({ visible: true });
    await transfersSwitch.click();
    await seen('AGUARDANDO CONFIRMAR').waitFor();
    await page.waitForLoadState('networkidle');
    await page.getByTestId('totals').filter({ visible: true }).waitFor();
    await seen('A confirmar')
      .first()
      .waitFor()
      .catch(() => {});
    await seen('Saiu e não voltou').waitFor();
    await shot('transacoes-transferencias');
    await transfersSwitch.click();

    // Imported lines waiting for approval, by bank read and statement.
    await page.getByRole('tab', { name: /revisar/i }).click();
    await seen('Aprovar todas (3)').waitFor();
    await page.waitForTimeout(400); // the closed sheet fades out
    await shot('transacoes-revisar');
    await page
      .getByRole('button', { name: /^Metro de Madrid/ })
      .filter({ visible: true })
      .first()
      .click();
    await seen('Importada, esperando sua aprovação para contar.').waitFor();
    await page.waitForTimeout(400); // the sheet fades in
    await shot('transacoes-revisar-detalhe');
    if (tag === 'celular') {
      await page.getByRole('button', { name: 'Fechar', exact: true }).click();
      await page.waitForTimeout(400);
    }
    await page.getByRole('button', { name: 'Aprovar todas (3)' }).filter({ visible: true }).click();
    await seen(/Nada para revisar/)
      .waitFor({ timeout: 5000 })
      .catch(() => flag('aprovar todas não atualizou a revisão'));

    // Every tab has loaded once: switching back must never show a blank or loading screen.
    await noBlankWhile('Início', () => tab('Início').click());
    await noBlankWhile('Investimentos', () => tab('Investimentos').click());
    await noBlankWhile('Transações', () => tab('Transações').click());

    // The pending banner on Início opens Transações on the Transferências tab.
    await tab('Início').click();
    await seen(/para confirmar/).click();
    await seen('AGUARDANDO CONFIRMAR').waitFor({ timeout: 3000 });

    // Answering it updates every tab, without reloading the page.
    await seen('É entre minhas contas').click();
    await seen('AGUARDANDO CONFIRMAR').waitFor({ state: 'detached', timeout: 3000 });
    await tab('Início').click();
    await page
      .getByText(/para confirmar/)
      .waitFor({ state: 'detached', timeout: 3000 })
      .catch(() => flag('Início ainda mostra a transferência já confirmada'));

    if (tag === 'computador') {
      // The sidebar stays on the upload page, next to the banks the app can read.
      await tab('Enviar extrato').filter({ visible: true }).first().click();
      await seen('Bancos suportados').waitFor();
      await page.waitForLoadState('networkidle');
      await shot('upload');
      await checkUndo();
      // Asking for a bank that isn't supported yet.
      await page.getByLabel('Nome do banco').fill('Santander');
      await page.getByRole('button', { name: 'Pedir' }).click();
      await seen('Pedido de Santander registrado.').waitFor({ timeout: 3000 });
      await seen('Já pedidos: Santander').waitFor({ timeout: 3000 });
      await shot('upload-pedido');
      // Conexões is its own page in the sidebar too.
      await tab('Conexões').filter({ visible: true }).first().click();
      await seen('Bancos conectados').waitFor();
      await seen('Automática').first().waitFor();
      await shot('conexoes');
      // Reading a bank now says what arrived.
      await page.getByRole('button', { name: 'Sincronizar agora' }).first().click();
      await seen('Wise EUR: 4 novas, 2 já existiam').waitFor({ timeout: 3000 });
      await page.getByText('Desconectar', { exact: true }).first().click();
      await seen('Parar de ler o Wise? As transações ficam.').waitFor({ timeout: 3000 });
      await shot('conexoes-sincronizado');
      await page.getByRole('button', { name: 'Cancelar' }).click();
      // These two pages stay mounted like the tabs: going back and forth never blanks or
      // rebuilds the page, so the sidebar on screen stays the very same element.
      const visibleSide = () =>
        [...document.querySelectorAll('[role=navigation]')].find((e) => e.offsetParent);
      for (const name of ['Enviar extrato', 'Início', 'Conexões', 'Transações']) {
        await page.evaluate((f) => (window.__side = eval(f)()), `(${visibleSide})`);
        await noBlankWhile(name, () => tab(name).filter({ visible: true }).first().click());
        const same = await page.evaluate((f) => eval(f)() === window.__side, `(${visibleSide})`);
        if (!same) flag(`${name}: a página inteira foi refeita ao abrir (pisca)`);
      }
    } else {
      // The page before may still be finishing its own navigation, which aborts this
      // load now and then; one more try is enough.
      // Opened from Início's button: loading /upload directly lands back on Início.
      await tab('Início').click();
      await page
        .getByRole('button', { name: 'Enviar extrato' })
        .filter({ visible: true })
        .first()
        .click();
      await seen('Envios anteriores').waitFor();
      await page.waitForLoadState('networkidle');
      await shot('upload');
      await checkUndo();
      await page.goto(`${base}/conexoes`);
      await seen('Bancos conectados').waitFor();
      await page.waitForLoadState('networkidle');
      await shot('conexoes');
    }
    // Conectar on the Brazil line opens Pluggy's own window over the page.
    await page.goto(`${base}/conexoes`);
    await seen('Bancos conectados').waitFor();
    const pluggyAsked = page.waitForRequest(/connect\.pluggy\.ai/, { timeout: 15000 });
    await page.getByRole('button', { name: 'Conectar', exact: true }).last().click();
    await pluggyAsked;
    await page
      .frameLocator('iframe[name^="__zoid__"]')
      .last()
      .getByText('Janela da Pluggy')
      .waitFor();
    await shot('conexoes-janela-pluggy');
    // Where Meu Pluggy sends the person back after authorizing a Brazilian bank.
    await page.goto(`${base}/conexoes/retorno-brasil`);
    await seen('Nubank conectado').waitFor({ timeout: 5000 });
    await shot('conexoes-retorno-brasil');
    // Categorias: the list, one category with its learned merchants, and a new one.
    await page.goto(`${base}/categorias`);
    await seen('Pets').waitFor();
    await page.waitForLoadState('networkidle');
    if (tag === 'celular') await shot('categorias');
    await page.getByTestId('category-Mercado').filter({ visible: true }).click();
    await seen('Pao de acucar').waitFor({ timeout: 5000 });
    await shot('categorias-detalhe');
    if (tag === 'celular') await page.getByRole('button', { name: 'Fechar' }).last().click();
    await page
      .getByText('Nova categoria', { exact: true })
      .filter({ visible: true })
      .first()
      .click();
    await seen('Criar categoria').waitFor();
    await shot('categorias-nova');
    // Responsáveis: the people, and who owns each account; one account changing hands.
    await page.goto(`${base}/responsaveis`);
    await seen('Wise EUR').waitFor();
    await page.waitForLoadState('networkidle');
    await shot('responsaveis');
    await page.getByRole('button', { name: 'Responsável por Wise EUR' }).click();
    await seen('Casa').last().waitFor();
    await shot('responsaveis-escolher');
    await page.getByRole('menuitem', { name: 'Ana' }).click();
    await page.getByRole('button', { name: 'Editar Ana' }).click();
    await seen('Excluir pessoa').waitFor();
    await shot('responsaveis-editar');
    await page.getByRole('button', { name: 'Cancelar' }).filter({ visible: true }).first().click();
    await page.getByTestId('add-person').filter({ visible: true }).click();
    await seen('Quem é').waitFor();
    await shot('responsaveis-adicionar');
    // Cartões: this month's bill (paid), the next one and the purchases with "3/10".
    await page.goto(`${base}/cartoes`);
    await seen('NUBANK CARTÃO').waitFor();
    await seen('Tok&Stok').waitFor();
    await page.waitForLoadState('networkidle');
    await shot('cartoes');
    await page.getByTestId('segment-next').filter({ visible: true }).click();
    await seen('Amazon').waitFor();
    await shot('cartoes-proxima');
    // Ajustes: the month starts on the 27th, and Início names the month by its days.
    await page.goto(`${base}/ajustes`);
    await seen('O mês começa no dia').waitFor();
    await shot('ajustes');
    await page.getByTestId('month-start-27').click();
    await page.getByRole('button', { name: 'Salvar início do mês' }).click();
    await seen('O mês agora começa no dia 27.').waitFor({ timeout: 5000 });
    await shot('ajustes-salvo');
    // Apagar todas: the button works only after typing APAGAR.
    await page.getByRole('button', { name: 'Apagar todas…' }).click();
    await seen(/Vão embora 312 transações/).waitFor();
    const purge = page.getByRole('button', { name: 'Apagar 312 transações' });
    if (await purge.isEnabled()) flag('apagar tudo funciona sem digitar APAGAR');
    await page.getByLabel('Digite APAGAR para confirmar').fill('apagar');
    await shot('ajustes-apagar-tudo');
    await purge.click();
    await seen('Pronto: 312 transações apagadas.').waitFor({ timeout: 3000 });
    await page.goto(`${base}/`);
    await seen(/\d+ \w{3} – \d+ \w{3}/).waitFor({ timeout: 5000 });
    await page.waitForLoadState('networkidle');
    await shot('inicio-dia-27');
    monthStartDay = 1;
  } catch (e) {
    flag(`roteiro parou: ${e.message.split('\n').slice(0, 12).join(' | ')}`);
    await shot('falha').catch(() => {});
  }
}

console.log(`Prints em ${out}:`);
for (const s of shots) console.log(`  ${s}`);
if (problems.length) {
  console.log(`\n${problems.length} problema(s):`);
  for (const p of [...new Set(problems)]) console.log(`  - ${p}`);
  process.exit(1);
}
console.log('\nNenhum problema encontrado.');
