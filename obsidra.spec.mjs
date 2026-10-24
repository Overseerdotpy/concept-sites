import { test, expect } from '@playwright/test';

const rate = (n) => '$' + (n * 2.19).toFixed(2) + '/h';
const text = (page, sel) => page.locator(sel).first().innerText().then((t) => t.replace(/\s+/g, ' ').trim());

test.describe('cluster dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/obsidra/dashboard/');
  });

  test('billing runs live, and Pause stops only the log feed, never the meter', async ({ page }) => {
    const clock0 = await text(page, '#s-clock');
    const cost0 = parseFloat((await text(page, '#s-cost')).replace('$', ''));
    await expect.poll(() => text(page, '#s-clock'), { timeout: 5000 }).not.toBe(clock0);
    expect(parseFloat((await text(page, '#s-cost')).replace('$', ''))).toBeGreaterThan(cost0);

    const lines = () => page.locator('#logs > *').count();
    await page.click('#btn-pause');
    await expect(page.locator('#btn-pause')).toHaveText('Resume');
    await expect(page.locator('#btn-pause')).toHaveAttribute('aria-pressed', 'true');
    await page.waitForTimeout(1800); // let an in-flight log line land
    const frozenLines = await lines();
    const clockPaused = await text(page, '#s-clock');
    await page.waitForTimeout(3600);
    expect(await lines(), 'log feed while paused').toBe(frozenLines);
    expect(await text(page, '#s-clock'), 'billing clock keeps running while the log is paused').not.toBe(clockPaused);

    await page.click('#btn-pause');
    await expect(page.locator('#btn-pause')).toHaveText('Pause');
    await expect.poll(lines, { timeout: 6000 }).toBeGreaterThan(frozenLines);
  });

  test('scaling shows the exact new price before you confirm, then applies it', async ({ page }) => {
    expect(await text(page, '#scale-rate')).toContain(rate(8));
    await page.click('#btn-scale');
    await expect(page.locator('#confirm-scale')).toHaveText('No change');
    for (const n of [4, 16, 32]) {
      await page.locator(`#dlg-scale button[data-n="${n}"]`).click();
      await expect(page.locator('#confirm-scale')).toHaveText(`Scale to ${n} GPUs`);
      expect(await text(page, '#scale-rate')).toContain(rate(n));
    }
    await page.locator('#dlg-scale button[data-n="16"]').click();
    await page.click('#confirm-scale');
    await expect(page.locator('#gpu-count-label')).toHaveText('16 × H100 80 GB');
    await expect(page.locator('#gpus > *')).toHaveCount(16);
    await expect(page.locator('#toast')).toContainText(`Now billing ${rate(16)}`);
    expect(await text(page, '#s-rate')).toContain(rate(16));
  });

  test('stopping asks first, shows the cost so far, and Keep running backs out', async ({ page }) => {
    await page.click('#btn-stop');
    await expect(page.locator('#dlg-stop')).toBeVisible();
    expect(await text(page, '#stop-cost')).toMatch(/^\$\d+\.\d{3}$/);
    await page.locator('#dlg-stop button', { hasText: 'Keep running' }).click();
    await expect(page.locator('#dlg-stop')).toBeHidden();
    await expect(page.locator('#gpus > *')).toHaveCount(8);
  });
});

test('the landing page headline and terminal are there, and the commands are keyboard reachable', async ({ page }) => {
  await page.goto('/obsidra/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Rent H100s by the second.');
  await expect(page.locator('.cmd-row code')).toHaveCount(3);
  for (const code of await page.locator('.cmd-row code').all()) await expect(code).toHaveAttribute('tabindex', '0');
});

test('the case study keeps its failing-contrast specimen labelled as a specimen', async ({ page }) => {
  await page.goto('/obsidra/case-study/');
  await expect(page.locator('[data-specimen]')).toHaveCount(1);
  await expect(page.locator('[data-specimen] .verdict')).toContainText('Fails WCAG AA');
});
