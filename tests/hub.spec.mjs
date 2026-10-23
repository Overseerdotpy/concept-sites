import { test, expect } from '@playwright/test';

test('project thumbnails load and keep their 16:10 shape (no stretched or cropped images)', async ({ page }) => {
  for (const width of [390, 800, 1360]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    const imgs = page.locator('.card img');
    await expect(imgs).toHaveCount(3);
    for (const img of await imgs.all()) {
      await img.scrollIntoViewIfNeeded();
      await expect.poll(() => img.evaluate((i) => i.complete && i.naturalWidth > 0), { message: 'thumbnail loaded' }).toBe(true);
      const { w, h } = await img.evaluate((i) => ({ w: i.getBoundingClientRect().width, h: i.getBoundingClientRect().height }));
      expect(Math.abs(w / h - 1.6), `${width}px: ${w}x${h}`).toBeLessThan(0.03);
    }
  }
});

test('every project card has a name, a one-line summary, tags and at least three links', async ({ page }) => {
  await page.goto('/');
  for (const card of await page.locator('.card').all()) {
    await expect(card.locator('h3')).not.toBeEmpty();
    await expect(card.locator('.sub')).not.toBeEmpty();
    expect(await card.locator('.tags li').count()).toBeGreaterThanOrEqual(3);
    expect(await card.locator('.links a').count()).toBeGreaterThanOrEqual(3);
  }
});

test('the skip link jumps to the projects and the nav reaches them', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Tab');
  await expect(page.locator('.skip')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#work$/);
  await expect(page.locator('#work')).toBeInViewport();
});
