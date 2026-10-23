import { test, expect } from '@playwright/test';
import { PAGES } from './pages.mjs';

// Quality gates that apply to every single page in the site.
for (const { path, name, app } of PAGES) {
  test.describe(name, () => {
    test('loads cleanly, with a title, description, language and one h1', async ({ page }) => {
      const problems = [];
      page.on('pageerror', (e) => problems.push('page error: ' + e.message));
      page.on('console', (m) => {
        if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)|ERR_NAME_NOT_RESOLVED|ERR_INTERNET_DISCONNECTED/.test(m.text())) problems.push('console: ' + m.text());
      });
      await page.goto(path);
      await page.waitForTimeout(800);
      expect(problems).toEqual([]);
      expect((await page.title()).length).toBeGreaterThan(8);
      const desc = await page.locator('meta[name="description"]').getAttribute('content');
      expect(desc.length, 'meta description length').toBeGreaterThan(50);
      expect(desc.length).toBeLessThan(200);
      await expect(page.locator('html')).toHaveAttribute('lang', 'en');
      await expect(page.locator('h1')).toHaveCount(1);
    });

    test('has no private links and no dead placeholder links', async ({ page }) => {
      await page.goto(path);
      const hrefs = await page.$$eval('a[href]', (as) => as.map((a) => a.href));
      expect(hrefs.filter((h) => /claude\.ai/.test(h)), 'links to claude.ai').toEqual([]);
      // a bare "#" link must at least be honest: app mockups mark screens that were never designed as disabled
      const dead = await page.$$eval('a[href="#"]', (as) => as.filter((a) => a.getAttribute('aria-disabled') !== 'true').map((a) => a.textContent.trim().slice(0, 30)));
      expect(dead, 'dead # links').toEqual([]);
    });

    test('every same-site link, image, script and stylesheet resolves', async ({ page }) => {
      await page.goto(path);
      const own = new URL(page.url()).origin;
      const urls = await page.evaluate(() =>
        [...document.querySelectorAll('a[href], img[src], script[src], link[href]')]
          .map((e) => e.href || e.src).filter(Boolean));
      const targets = [...new Set(urls.filter((u) => u.startsWith(own)).map((u) => u.split('#')[0]))];
      for (const url of targets) {
        const res = await page.request.get(url);
        expect(res.status(), url).toBe(200);
      }
    });

    for (const width of [320, 390, 1360]) {
      test(`no horizontal overflow at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(path);
        await page.waitForTimeout(600);
        expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
      });
    }

    test('respects reduced motion (nothing keeps animating once settled)', async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto(path);
      await page.waitForTimeout(600);
      const running = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running' && a.effect && a.effect.getComputedTiming().iterations === Infinity).length);
      // infinite CSS animations (spinners, marquees) should be switched off; live data in app mockups is JS-driven and exempt
      if (!app) expect(running).toBe(0);
    });
  });
}

// Link previews: what a recruiter sees when the link is pasted into LinkedIn, Slack or an email.
const BASE = 'https://overseerdotpy.github.io/concept-sites/';
for (const { path, name } of PAGES) {
  test(`${name}: has a complete link preview whose image exists at 1200x630`, async ({ page }) => {
    await page.goto(path);
    const meta = (k) => page.locator(`meta[property="${k}"], meta[name="${k}"]`).first().getAttribute('content');
    expect((await meta('og:title')).length).toBeGreaterThan(5);
    expect((await meta('og:description')).length).toBeGreaterThan(50);
    expect(await meta('twitter:card')).toBe('summary_large_image');
    expect(await meta('og:url')).toBe(BASE + path.replace(/^\//, ''));
    const image = await meta('og:image');
    expect(image.startsWith(BASE + 'assets/og/')).toBe(true);
    // the same file, served by the local test server
    const local = '/' + image.slice(BASE.length);
    const size = await page.evaluate((src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res([i.naturalWidth, i.naturalHeight]); i.onerror = () => rej(new Error('image failed to load: ' + src)); i.src = src; }), local);
    expect(size).toEqual([1200, 630]);
    expect((await meta('og:image:alt')).length).toBeGreaterThan(10);
  });
}
