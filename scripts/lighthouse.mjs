// Lighthouse (mobile and desktop) for every page. Usage:
//   node scripts/lighthouse.mjs                 all pages, both form factors
//   node scripts/lighthouse.mjs mobile          one form factor
//   node scripts/lighthouse.mjs both /obsidra/  specific pages
// Raw reports go to .lighthouse/ (git-ignored).
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import lighthouse from 'lighthouse';
import * as chromeLauncher from 'chrome-launcher';

const ALL = ['/', '/obsidra/', '/obsidra/dashboard/', '/obsidra/case-study/', '/amberline/', '/amberline/app/', '/amberline/logo/', '/amberline/case-study/',
  '/northvale/', '/northvale/site/', '/northvale/book/', '/northvale/trip/', '/northvale/case-study/', '/northvale/brand/system/', '/northvale/brand/logo/', '/northvale/brand/motion/', '/northvale/brand/type/', '/northvale/brand/palette/'];
const form = ['mobile', 'desktop', 'both'].includes(process.argv[2]) ? process.argv[2] : 'both';
const pages = process.argv.slice(process.argv[2] && ['mobile', 'desktop', 'both'].includes(process.argv[2]) ? 3 : 2);
const targets = pages.length ? pages : ALL;
const forms = form === 'both' ? ['mobile', 'desktop'] : [form];

const PORT = 4190;
const server = spawn('npx', ['http-server', 'site', '-p', String(PORT), '-s', '-c-1'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));
const chrome = await chromeLauncher.launch({ chromePath: process.env.CHROME_PATH, chromeFlags: ['--headless=new', '--no-sandbox'] });
mkdirSync('.lighthouse', { recursive: true });

const pct = (x) => Math.round(x * 100);
const desktop = { extends: 'lighthouse:default', settings: { formFactor: 'desktop', screenEmulation: { mobile: false, width: 1350, height: 940, deviceScaleFactor: 1, disabled: false }, throttling: { rttMs: 40, throughputKbps: 10240, cpuSlowdownMultiplier: 1 } } };
const mobile = { extends: 'lighthouse:default', settings: { formFactor: 'mobile' } };
console.log('page'.padEnd(26), 'form'.padEnd(8), 'perf  a11y  best  seo   LCP      CLS    weight');
try {
  for (const path of targets) {
    for (const f of forms) {
      const { lhr } = await lighthouse(`http://127.0.0.1:${PORT}${path}`, { port: chrome.port, output: 'json', logLevel: 'error' }, f === 'mobile' ? mobile : desktop);
      writeFileSync(`.lighthouse/${path.replace(/\W+/g, '_')}${f}.json`, JSON.stringify(lhr));
      const c = lhr.categories, a = lhr.audits;
      console.log(path.padEnd(26), f.padEnd(8), String(pct(c.performance.score)).padEnd(5), String(pct(c.accessibility.score)).padEnd(5), String(pct(c['best-practices'].score)).padEnd(5), String(pct(c.seo.score)).padEnd(5), (a['largest-contentful-paint'].displayValue || '').padEnd(8), (a['cumulative-layout-shift'].displayValue || '').padEnd(6), a['total-byte-weight'].displayValue.replace('Total size was ', ''));
    }
  }
} finally {
  await chrome.kill();
  server.kill();
}
