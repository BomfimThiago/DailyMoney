// UI check for the web build: opens every screen with sample data at phone size, saves
// screenshots, fails on page errors and on blank frames when switching tabs.
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

function answer(url, method) {
  const p = url.pathname.replace(/^\/api\/v1/, '');
  if (method === 'PUT' && p.endsWith('/kind')) return { status: 200, body: {} };
  if (p === '/transactions' && url.searchParams.getAll('kind').join() === 'regular') {
    return { status: 200, body: fixtures.regular };
  }
  if (p in fixtures) return { status: 200, body: fixtures[p] };
  return { status: 404, body: { detail: `sem dado de exemplo para ${p}` } };
}

const problems = [];
const shots = [];
const { chromium } = loadPlaywright();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
page.on('pageerror', (e) => problems.push(`erro na página: ${e.message}`));
page.on('console', (m) => m.type() === 'error' && problems.push(`console: ${m.text()}`));
await page.route('**/api/v1/**', async (route) => {
  const req = route.request();
  const { status, body } = answer(new URL(req.url()), req.method());
  if (status === 404)
    problems.push(`API sem exemplo: ${req.method()} ${new URL(req.url()).pathname}`);
  await new Promise((r) => setTimeout(r, 150)); // a little latency, like the real API
  await route.fulfill({ status, json: body });
});

async function shot(name) {
  const file = path.join(out, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  shots.push(file);
}

async function noBlankWhile(label, action) {
  await action();
  for (let i = 0; i < 15; i++) {
    const text = (await page.locator('body').innerText()).trim();
    const loading = await page.locator('[role=progressbar]:visible').count();
    if (text.length < 40 || loading) {
      problems.push(`${label}: tela vazia ou carregando ao trocar de aba`);
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
  await page.getByText('Últimos movimentos').waitFor();
  await page.waitForLoadState('networkidle');
  await shot('inicio');

  // Tabs stay mounted, so the same text can exist on a hidden tab: wait for the visible one.
  const seen = (text) => page.getByText(text).filter({ visible: true }).first();
  const tab = (name) => page.getByRole('tab', { name, exact: true });
  await tab('Investimentos').click();
  await seen('Seus produtos').waitFor();
  await shot('investimentos-produtos');
  await page.getByRole('tab', { name: 'Movimentos' }).click();
  await shot('investimentos-movimentos');

  await tab('Transações').click();
  await seen('Pão de Açúcar').waitFor();
  await shot('transacoes-lista');
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

  await page.goto(`${base}/upload`);
  await page.waitForLoadState('networkidle');
  await shot('upload');
} catch (e) {
  problems.push(`roteiro parou: ${e.message.split('\n')[0]}`);
  await shot('falha').catch(() => {});
} finally {
  await browser.close();
  server.close();
}

console.log(`Prints em ${out}:`);
for (const s of shots) console.log(`  ${s}`);
if (problems.length) {
  console.log(`\n${problems.length} problema(s):`);
  for (const p of [...new Set(problems)]) console.log(`  - ${p}`);
  process.exit(1);
}
console.log('\nNenhum problema encontrado.');
