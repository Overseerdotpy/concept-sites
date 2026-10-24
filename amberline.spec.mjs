import { test, expect } from '@playwright/test';

const text = (page, sel) => page.locator(sel).first().innerText().then((t) => t.replace(/\s+/g, ' ').trim());
const money = (s) => parseFloat(s.replace(/[^0-9.]/g, ''));
const rows = (page) => page.locator('#rows > *').count();
const filter = (page, name) => page.locator('button[data-f]', { hasText: new RegExp('^' + name) }).first().click();

test.describe('app home', () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/amberline/app/');
  });

  test('the filters partition the invoices exactly', async ({ page }) => {
    const counts = {};
    for (const f of ['On its way', 'Overdue', 'Paid', 'Draft']) { await filter(page, f); counts[f] = await rows(page); }
    await filter(page, 'All');
    const all = await rows(page);
    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(all);
    expect(counts).toEqual({ 'On its way': 3, Overdue: 1, Paid: 2, Draft: 1 });
  });

  test('the new-invoice form rejects a missing or zero amount and keeps the dialog open', async ({ page }) => {
    await page.click('#btn-new');
    for (const bad of ['', '0', '0.00', '$']) {
      await page.fill('#f-amt', bad);
      await page.click('#f-send');
      await expect(page.locator('#f-err'), `amount "${bad}"`).toHaveText(bad === '$' ? 'Enter an amount greater than $0.' : 'Enter an amount greater than $0.');
      await expect(page.locator('#dlg')).toHaveJSProperty('open', true);
    }
  });

  // Regression: the amount used to be "cleaned" by deleting unknown characters, so a typo quietly became a
  // different invoice (-5 became $5.00, 12abc became $12.00, 1.2.3 became $1.20).
  for (const bad of ['-5', '1e3', '12abc', '1.2.3', 'abc', '1,2,3x']) {
    test(`a malformed amount (${bad}) is rejected, not reinterpreted`, async ({ page }) => {
      const before = await rows(page);
      await page.click('#btn-new');
      await page.fill('#f-amt', bad);
      await page.click('#f-send');
      await expect(page.locator('#f-err')).toHaveText('Enter an amount like 1,250 or 1,250.50.');
      await expect(page.locator('#dlg')).toHaveJSProperty('open', true);
      expect(await rows(page)).toBe(before);
    });
  }

  for (const [typed, shown] of [['1234', '$1,234.00'], ['1,234.50', '$1,234.50'], ['$2,200', '$2,200.00'], ['.5', '$0.50']]) {
    test(`a normal amount (${typed}) is accepted as ${shown}`, async ({ page }) => {
      await page.click('#btn-new');
      await page.fill('#f-amt', typed);
      await page.click('#f-send');
      await expect(page.locator('#dlg')).toHaveJSProperty('open', false);
      expect(await text(page, '#rows > *:first-child')).toContain(shown);
    });
  }

  test('sending an invoice adds it to the list and confirms', async ({ page }) => {
    const before = await rows(page);
    await page.click('#btn-new');
    await page.selectOption('#f-client', 'Lumen Press');
    await page.fill('#f-amt', '1234');
    await page.fill('#f-desc', 'Landing page');
    await page.locator('#dlg button[data-d="14"]').click();
    await page.click('#f-send');
    await expect(page.locator('#dlg')).toHaveJSProperty('open', false);
    expect(await rows(page)).toBe(before + 1);
    await expect(page.locator('#toast')).toContainText('Invoice sent to Lumen Press.');
    const first = await text(page, '#rows > *:first-child');
    expect(first).toContain('Lumen Press');
    expect(first).toContain('$1,234.00');
    expect(first).toContain('In 14 days');
  });

  test('saving a draft puts it under Draft and does not send it', async ({ page }) => {
    await page.click('#btn-new');
    await page.selectOption('#f-client', 'Fernhill Bakery');
    await page.fill('#f-amt', '500');
    await page.click('#f-draft');
    await expect(page.locator('#toast')).toContainText('Draft saved for Fernhill Bakery.');
    await filter(page, 'Draft');
    expect(await rows(page)).toBe(2);
  });

  test('marking an invoice paid moves exactly 25% of it into the tax pot', async ({ page }) => {
    const pot0 = money(await text(page, '#pot-total'));
    const row = page.locator('#rows > *', { has: page.locator('button', { hasText: 'Mark paid' }) }).first();
    const amount = money((await row.innerText()).match(/\$[\d,]+\.\d{2}/)[0]);
    await row.locator('button', { hasText: 'Mark paid' }).click();
    await expect(page.locator('#toast')).toContainText('moved to your tax pot');
    expect(money(await text(page, '#pot-total'))).toBeCloseTo(pot0 + amount * 0.25, 2);
    await filter(page, 'Paid');
    expect(await rows(page)).toBe(3);
  });

  test('reminding an overdue client confirms and updates the row', async ({ page }) => {
    await filter(page, 'Overdue');
    await page.locator('#rows button', { hasText: 'Remind' }).first().click();
    await expect(page.locator('#toast')).toContainText('Reminder sent to Haldane & Co.');
    expect(await text(page, '#rows')).toContain('Reminder sent just now');
  });
});

test('the landing page and logo page say what they should', async ({ page }) => {
  await page.goto('/amberline/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Know what');
  await page.goto('/amberline/logo/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('The l is the line.');
});

test('the html2canvas library is served from this site, not a CDN', async ({ page }) => {
  await page.goto('/amberline/app/');
  const srcs = await page.$$eval('script[src]', (s) => s.map((x) => x.getAttribute('src')));
  expect(srcs).toContain('../../vendor/html2canvas.min.js');
  expect(srcs.filter((s) => /cdnjs|unpkg|jsdelivr/.test(s))).toEqual([]);
});
