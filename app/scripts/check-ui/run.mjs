// UI check for the web build: opens every screen with sample data at phone size and at
// computer size, saves screenshots, fails on page errors and on blank frames when
// switching tabs.
//   VIEWPORT=1440x900 npm run check:ui   only one size
//   npm run check:ui              build the web app, then check it
//   DIST=dist npm run check:ui    reuse an existing build
// Screenshots go to $OUT (default: <tmp>/dailymoney-check-ui). Look at them before
// calling a UI change done.
import { execSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { fixtures } from './fixtures.mjs';

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
// Category changes the screens sent (PATCH /transactions/{id}).
const recategorized = [];

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
  if (answered && p === '/transactions/summary') {
    return { status: 200, body: { ...fixtures[p], pending_transfers: 0 } };
  }
  if (answered && p === '/transactions/transfers') {
    return { status: 200, body: { ...fixtures[p], pending: [] } };
  }
  if (p === '/transactions' && url.searchParams.getAll('kind').join() === 'regular') {
    const q = (url.searchParams.get('q') ?? '').toLowerCase();
    const items = fixtures.regular.items.filter((t) => t.description.toLowerCase().includes(q));
    return { status: 200, body: { total: items.length, items } };
  }
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
  page.on('console', (m) => m.type() === 'error' && flag(`console: ${m.text()}`));
  await page.route('**/api/v1/**', async (route) => {
    const req = route.request();
    const { status, body } = answer(new URL(req.url()), req.method());
    if (status === 404) flag(`API sem exemplo: ${req.method()} ${new URL(req.url()).pathname}`);
    await new Promise((r) => setTimeout(r, 150)); // a little latency, like the real API
    await route.fulfill({ status, json: body });
  });

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

    // Tabs stay mounted, so the same text can exist on a hidden tab: wait for the visible one.
    const seen = (text) => page.getByText(text).filter({ visible: true }).first();
    // Bottom tabs on a phone, sidebar links on a computer: both carry the same test id.
    const tab = (name) => page.getByTestId(`tab-${name}`);
    await tab('Investimentos').click();
    await seen('Seus produtos').waitFor();
    if (tag === 'computador') {
      // Products and the month's movements side by side, no Produtos/Movimentos switch.
      await seen('Aplicação RDB').waitFor();
      await shot('investimentos');
    } else {
      await shot('investimentos-produtos');
      await page.getByRole('tab', { name: 'Movimentos' }).click();
      await shot('investimentos-movimentos');
    }

    await tab('Transações').click();
    await seen('Pão de Açúcar').waitFor();
    await shot('transacoes-lista');

    // A line opens its detail (beside the table, or as a sheet on a phone), where the
    // category can change.
    // By role: Início, mounted underneath, also shows this line as plain text.
    await page
      .getByRole('button', { name: /^Pão de Açúcar/ })
      .filter({ visible: true })
      .first()
      .click();
    await seen('Valer também para as próximas deste estabelecimento').waitFor();
    await page.waitForTimeout(400); // the sheet fades in
    await shot('transacoes-detalhe');
    await page.getByRole('radio', { name: 'Restaurantes' }).filter({ visible: true }).click();
    await page.waitForTimeout(400);
    if (recategorized.length !== 1) flag('trocar a categoria não chamou a API');
    if (tag === 'celular') {
      await page.getByRole('button', { name: 'Fechar', exact: true }).click();
      await seen('Valer também para as próximas deste estabelecimento')
        .waitFor({ state: 'detached', timeout: 3000 })
        .catch(() => flag('a folha de detalhe não fechou'));
    } else {
      // Search narrows the table.
      await page.getByLabel('Buscar descrição').fill('netf');
      await page
        .getByText('Uber')
        .filter({ visible: true })
        .waitFor({ state: 'detached', timeout: 3000 })
        .catch(() => flag('a busca não filtrou a tabela'));
      await shot('transacoes-busca');
      await page.getByLabel('Buscar descrição').fill('');
      await seen('Uber').waitFor();
    }
    await page.getByRole('tab', { name: /Transferências/ }).click();
    await seen('AGUARDANDO CONFIRMAR').waitFor();
    await shot('transacoes-transferencias');

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
      await page.getByRole('button', { name: 'Enviar extrato' }).click();
      await seen('Bancos que já sei ler').waitFor();
      await tab('Transações').filter({ visible: true }).first().waitFor();
    } else {
      await page.goto(`${base}/upload`);
    }
    await page.waitForLoadState('networkidle');
    await shot('upload');
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
