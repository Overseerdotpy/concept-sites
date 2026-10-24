import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { PAGES } from './pages.mjs';

// WCAG 2.0/2.1 A and AA via axe-core. Fails on serious or critical violations.
// Reduced motion is emulated so intro animations are in their settled state when the page is scanned.
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

for (const { path, name } of PAGES) {
  test(`axe: ${name}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(path);
    await page.waitForTimeout(1500);
    // [data-specimen] marks deliberate failing examples inside the case studies (the lesson is the failure).
    const { violations } = await new AxeBuilder({ page }).withTags(TAGS).exclude('[data-specimen]').analyze();
    const blocking = violations.filter((v) => ['serious', 'critical'].includes(v.impact));
    const summary = blocking.map((v) => `${v.id} (${v.impact}, ${v.nodes.length}): ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
    expect(summary, name).toEqual([]);
  });
}
