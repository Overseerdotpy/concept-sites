import { test, expect } from '@playwright/test';

test('the hub lists every project and each link opens the right page', async ({ page }) => {
  await page.goto('/');
  const expected = [
    ['Landing page', 'obsidra/', /Obsidra/], ['Dashboard', 'obsidra/dashboard/', /h100-07/], ['Case study', 'obsidra/case-study/', /Obsidra case study/],
    ['Landing page', 'amberline/', /Amberline/], ['App home', 'amberline/app/', /Home · Amberline/], ['Logo guidelines', 'amberline/logo/', /logo/i], ['Case study', 'amberline/case-study/', /Amberline case study/],    ['Open the project', 'northvale/', /Northvale Expeditions/], ['Website', 'northvale/site/', /Northvale Expeditions — guided alpine trips/], ['Book a trip', 'northvale/book/', /Book your trip/], ['Case study', 'northvale/case-study/', /Northvale Expeditions case study/],
  ];
  for (const [label, href, title] of expected) {
    const link = page.locator(`.card a[href="${href}"]`);
    await expect(link, `${href}`).toHaveCount(1);
    await expect(link).toHaveText(label);
    await link.click();
    await expect(page).toHaveTitle(title);
    await page.goBack();
  }
  await expect(page.locator('.card')).toHaveCount(4);
});

test('the hub links out to TRAVL, its case study, story and source', async ({ page }) => {
  await page.goto('/');
  const hrefs = await page.$$eval('.card a', (as) => as.map((a) => a.href));
  for (const h of ['https://overseerdotpy.github.io/travl-store/', 'https://overseerdotpy.github.io/travl-store/case-study/', 'https://overseerdotpy.github.io/travl-store/story/', 'https://github.com/Overseerdotpy/travl-store']) expect(hrefs).toContain(h);
});

test('each case study links to its project pages, and home returns to the hub', async ({ page }) => {
  const cases = {
    '/obsidra/case-study/': ['/obsidra/', '/obsidra/dashboard/'],
    '/amberline/case-study/': ['/amberline/', '/amberline/app/', '/amberline/logo/'],
    '/northvale/case-study/': ['/northvale/site/', '/northvale/book/', '/northvale/trip/', '/northvale/brand/logo/'],
  };
  for (const [path, targets] of Object.entries(cases)) {
    await page.goto(path);
    const hrefs = await page.$$eval('a[href]', (as) => as.map((a) => new URL(a.href).pathname));
    for (const t of targets) expect(hrefs, `${path} -> ${t}`).toContain(t);
    await page.locator('a', { hasText: /^Ash$/ }).first().click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page).toHaveTitle(/Ash/);
  }
});

test('the case-study top bar goes somewhere real', async ({ page }) => {
  await page.goto('/obsidra/case-study/');
  const bar = await page.$$eval('header a, nav a', (as) => as.map((a) => [a.textContent.trim(), a.getAttribute('href')]).filter(([t]) => ['Work', 'About', 'Contact'].includes(t)));
  expect(Object.fromEntries(bar)).toMatchObject({ Work: '../../#work', About: 'https://github.com/Overseerdotpy', Contact: 'mailto:ashlundg1@gmail.com' });
});

test('app wordmarks lead back to the project; unbuilt screens are disabled and do nothing', async ({ page }) => {
  for (const [path, home] of [['/obsidra/dashboard/', '/obsidra/'], ['/amberline/app/', '/amberline/']]) {
    await page.goto(path);
    const disabled = page.locator('a[aria-disabled="true"]').first();
    await expect(disabled).toBeVisible();
    const before = page.url();
    await disabled.click({ force: true });
    expect(page.url(), 'a disabled link must not change the URL').toBe(before);
    await page.locator('a[aria-label$="home"]').first().click();
    await expect(page).toHaveURL(new RegExp(home + '$'));
  }
});
