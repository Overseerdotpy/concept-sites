import { test, expect } from '@playwright/test';

const TABS = ['website', 'book', 'trip', 'case-study', 'brand'];
const selected = (page) => page.locator('[role="tab"][aria-selected="true"]');
const frame = (page, id) => page.frameLocator(`#p-${id} iframe`);

// Walks the whole booking. `scope` is a page or a frame: both have .locator()
async function completeBooking(scope) {
  await scope.locator('#n1').click();
  await scope.locator('#n2').click();                                    // nothing entered yet
  await expect(scope.locator('#nm0-err')).toHaveText('Add a name, as it appears on their ID.');
  await expect(scope.locator('#email-err')).toHaveText('Enter an email for your confirmation.');
  await scope.locator('#nm0').fill('Ash Gibson');
  await scope.locator('#email').fill('ash@example.com');
  await scope.locator('#n2').click();
  await scope.locator('#n3').click();                                    // unanswered
  await expect(scope.locator('#chk-err')).toContainText('Answer each one');
  for (const yes of await scope.locator('button:visible', { hasText: /^Yes/ }).all()) await yes.click();
  await scope.locator('#n3').click();
  await scope.locator('#n4').click();                                    // gear is optional
  await scope.locator('#cname').fill('Ash Gibson');
  await scope.locator('#cnum').fill('4242 4242 4242 4242');
  await scope.locator('#cexp').fill('12/30');
  await scope.locator('#ccvc').fill('123');
  await scope.locator('#pay').click();
  await expect(scope.locator('#ref')).toContainText(/NV-\d{4}-\d{4}/, { timeout: 8000 });
  return (await scope.locator('#ref').innerText()).match(/NV-\d{4}-\d{4}/)[0];
}

const loadedFrames = (page) => page.$$eval('iframe', (f) => f.filter((x) => x.getAttribute('src')).length);

test.describe('the combined page', () => {
  test.beforeEach(async ({ page }) => { await page.emulateMedia({ reducedMotion: 'reduce' }); });

  test('has five tabs, opens on Website, and loads each view only when it is first needed', async ({ page }) => {
    await page.goto('/northvale/');
    await expect(page.locator('[role="tab"]')).toHaveText(['Website', 'Book a trip', 'Your trip', 'Case study', 'Brand']);
    await expect(selected(page)).toHaveText('Website');
    await expect(page.locator('#p-website')).toBeVisible();
    expect(await loadedFrames(page), 'only the first view is loaded up front').toBe(1);
    for (const id of TABS.slice(1)) {
      await page.locator(`#t-${id}`).click();
      await expect(page.locator(`#p-${id}`)).toBeVisible();
      for (const other of TABS.filter((t) => t !== id)) await expect(page.locator(`#p-${other}`)).toBeHidden();
      await expect(page).toHaveURL(new RegExp(`#${id === 'brand' ? 'brand/system' : id}$`));
    }
    expect(await loadedFrames(page)).toBe(5);
  });

  test('each view has an accessible name and the tab title follows it', async ({ page }) => {
    await page.goto('/northvale/');
    for (const f of await page.locator('iframe').all()) expect((await f.getAttribute('title')).length).toBeGreaterThan(8);
    await page.locator('#t-case-study').click();
    await expect(page).toHaveTitle(/^Case study · Northvale Expeditions/);
  });

  test('arrow keys, Home and End move between tabs like any tab list', async ({ page }) => {
    await page.goto('/northvale/');
    await page.locator('#t-website').focus();
    await page.keyboard.press('ArrowRight');
    await expect(selected(page)).toHaveText('Book a trip');
    await expect(page.locator('#t-book')).toBeFocused();
    await page.keyboard.press('End');
    await expect(selected(page)).toHaveText('Brand');
    await page.keyboard.press('ArrowRight');
    await expect(selected(page), 'wraps around').toHaveText('Website');
    await page.keyboard.press('ArrowLeft');
    await expect(selected(page)).toHaveText('Brand');
  });

  test('deep links open the right view, and Back returns to the previous one', async ({ page }) => {
    await page.goto('/northvale/#case-study');
    await expect(selected(page)).toHaveText('Case study');
    await page.goto('/northvale/#brand/type');
    await expect(selected(page)).toHaveText('Brand');
    await expect(page.locator('button[data-brand="type"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#p-brand iframe')).toHaveAttribute('src', 'brand/type/');
    await page.locator('#t-trip').click();
    await page.goBack();
    await expect(selected(page)).toHaveText('Brand');
  });

  test('the Brand tab offers five pages and switches between them without leaving', async ({ page }) => {
    await page.goto('/northvale/#brand');
    const buttons = page.locator('#sub button');
    await expect(buttons).toHaveText(['Brand system', 'Logo', 'Logo animation', 'Type directions', 'Palette directions']);
    for (const [key, h1] of [['logo', /vale, then the peak/i], ['motion', /needle finds north/i], ['type', /type directions/i], ['palette', /palette directions/i], ['system', /summit rust/i]]) {
      await page.locator(`button[data-brand="${key}"]`).click();
      await expect(page.locator(`button[data-brand="${key}"]`)).toHaveAttribute('aria-pressed', 'true');
      await expect(frame(page, 'brand').locator('h1')).toHaveText(h1);
    }
    await page.locator('#t-website').click();
    await expect(page.locator('#sub')).toBeHidden();
  });

  test('a view keeps its state while you look at another tab', async ({ page }) => {
    await page.goto('/northvale/');
    await frame(page, 'website').locator('a[href*="glacier"]').first().click();
    const book = frame(page, 'book');
    await book.locator('#n1').click();
    await book.locator('#nm0').fill('Ash Gibson');
    await page.locator('#t-case-study').click();
    await page.locator('#t-book').click();
    await expect(book.locator('#nm0')).toHaveValue('Ash Gibson');
  });

  test('works on a phone: the tab bar scrolls sideways and every tab can be reached', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/northvale/');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await page.locator('#t-brand').scrollIntoViewIfNeeded();
    await page.locator('#t-brand').click();
    await expect(selected(page)).toHaveText('Brand');
    await expect(page.locator('#sub')).toBeVisible();
  });
});

test.describe('the pages talk to each other, the way they were designed to', () => {
  test.beforeEach(async ({ page }) => { await page.emulateMedia({ reducedMotion: 'reduce' }); });

  test('pages know when they are inside the combined page, and only then', async ({ page }) => {
    await page.goto('/northvale/');
    await expect(page.locator('html')).toHaveAttribute('data-nv-shell', '1');
    const inside = page.frames().find((f) => /northvale\/site\//.test(f.url()));
    expect(await inside.evaluate(() => window.__NV_HUB)).toBe(true);
    await page.goto('/northvale/site/');
    expect(await page.evaluate(() => window.__NV_HUB)).toBe(false);
  });

  for (const [label, href, trip, date] of [['Book 5 Jul', 'glacier', /first glacier crossing/i, '5 Jul'], ['Book 14 Jun', 'trek', /hut-to-hut trek/i, '14 Jun'], ['Book 16 Aug', 'summit', /your first summit/i, '16 Aug']]) {
    test(`choosing a departure on the website (${label}) opens booking with that trip and date`, async ({ page }) => {
      await page.goto('/northvale/');
      await frame(page, 'website').locator(`a[href*="${href}"]`).first().click();
      await expect(selected(page)).toHaveText('Book a trip');
      const book = frame(page, 'book');
      await expect(book.locator('#s-name')).toHaveText(trip);
      await expect(book.locator('#s-dep')).toContainText(date);
    });
  }

  test('picking a second departure after booking is already open updates it', async ({ page }) => {
    await page.goto('/northvale/');
    await frame(page, 'website').locator('a[href*="glacier"]').first().click();
    await expect(frame(page, 'book').locator('#s-name')).toHaveText(/first glacier crossing/i);
    await page.locator('#t-website').click();
    await frame(page, 'website').locator('a[href*="summit"]').first().click();
    await expect(frame(page, 'book').locator('#s-name')).toHaveText(/your first summit/i);
  });

  test('book a trip, pay the deposit, and land on your own trip page', async ({ page }) => {
    await page.goto('/northvale/');
    await frame(page, 'website').locator('a[href*="glacier"]').first().click();
    const book = frame(page, 'book');

    const ref = await completeBooking(book);
    await expect(book.getByRole('heading', { level: 2 })).toContainText(/You.re going up, Ash/i);
    await book.locator('#to-trip').click();

    await expect(selected(page)).toHaveText('Your trip');
    const trip = frame(page, 'trip');
    await expect(trip.locator('h1')).toHaveText(/first glacier crossing/i);
    await expect(trip.locator('body')).toContainText(ref);
  });

  test('the case study buttons switch tabs instead of leaving the page', async ({ page }) => {
    await page.goto('/northvale/#case-study');
    const cs = frame(page, 'case-study');
    for (const [button, tab] of [['View the landing page', 'Website'], ['Try the booking flow', 'Book a trip'], ['Open the trip dashboard', 'Your trip'], ['Logo guidelines', 'Brand']]) {
      await page.locator('#t-case-study').click();
      await cs.getByRole('link', { name: button }).click();
      await expect(selected(page), button).toHaveText(tab);
    }
    await expect(page.locator('button[data-brand="logo"]')).toHaveAttribute('aria-pressed', 'true');
  });

  test('the booking page links back to the website\'s trips section', async ({ page }) => {
    await page.goto('/northvale/#book');
    await frame(page, 'book').getByRole('link', { name: /back to trips/i }).click();
    await expect(selected(page)).toHaveText('Website');
  });

  test('links that must leave the frame (home, GitHub, email) break out of it', async ({ page }) => {
    await page.goto('/northvale/site/'.replace('site/', 'case-study/'));
    for (const [text, target] of [['Ash', '_top'], ['Work', '_top'], ['About', '_top'], ['Contact', '_top']]) {
      await expect(page.locator('a', { hasText: new RegExp('^' + text + '$') }).first()).toHaveAttribute('target', target);
    }
  });

  test('messages from anything other than the embedded pages are ignored', async ({ page }) => {
    await page.goto('/northvale/');
    await page.evaluate(() => window.postMessage({ hub: 'goto', to: 'trip' }, '*'));
    await page.waitForTimeout(400);
    await expect(selected(page)).toHaveText('Website');
  });
});

test.describe('each page still works on its own', () => {
  test.beforeEach(async ({ page }) => { await page.emulateMedia({ reducedMotion: 'reduce' }); });

  test('a booking link with a trip and date presets the booking', async ({ page }) => {
    await page.goto('/northvale/book/#summit%7C16%20Aug');
    await expect(page.locator('#s-name')).toHaveText(/your first summit/i);
    await expect(page.locator('#s-dep')).toContainText('16 Aug');
  });

  test('the website\'s booking links point at the booking page, not at the old private page', async ({ page }) => {
    await page.goto('/northvale/site/');
    const hrefs = await page.$$eval('a[href*="book"]', (as) => as.map((a) => a.getAttribute('href')));
    expect(hrefs.length).toBeGreaterThan(0);
    for (const h of hrefs) expect(h).toMatch(/^\.\.\/book\/#/);
  });

  // Regression: the link used to be built before the booking existed, so it never carried it.
  // Book a trip that is NOT the trip page's default, so a missing booking cannot pass by luck.
  test('finishing a booking on the standalone page opens the trip page on that booking', async ({ page }) => {
    await page.goto('/northvale/book/#trek%7C14%20Jun');
    await expect(page.locator('#s-name')).toHaveText(/hut-to-hut trek/i);
    const ref = await completeBooking(page);
    await expect(page.locator('#to-trip')).toHaveAttribute('href', /^\.\.\/trip\/#/);
    await page.locator('#to-trip').click();
    await expect(page).toHaveURL(/\/northvale\/trip\/#/);
    await expect(page.locator('h1')).toHaveText(/hut-to-hut trek/i);
    await expect(page.locator('body')).toContainText(ref);
  });

  test('without being inside the combined page, the case study links go to the pages themselves', async ({ page }) => {
    await page.goto('/northvale/case-study/');
    const hrefs = await page.$$eval('a[data-hub]', (as) => as.map((a) => a.getAttribute('href')));
    expect(hrefs.sort()).toEqual(['../book/', '../brand/logo/', '../site/', '../trip/']);
    await page.getByRole('link', { name: 'Try the booking flow' }).click();
    await expect(page).toHaveURL(/\/northvale\/book\/$/);
  });
});

test.describe('the light beam footer (re-created from the 21st.dev "Light Beam Footer with Giant Wordmark")', () => {
  const geometry = (page) => page.evaluate(() => {
    const f = document.getElementById('footer'), w = f.querySelector('.lb-word span');
    const fr = f.getBoundingClientRect(), wr = w.getBoundingClientRect();
    return { fw: fr.width, fh: fr.height, ww: wr.width, wTop: wr.top - fr.top, wBottom: wr.bottom - fr.top, left: fr.left - wr.left, top: fr.top - wr.top };
  });

  test('a giant wordmark, cropped by the bottom edge, that is invisible to screen readers', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/northvale/');
    await expect(page.locator('.lb-word')).toHaveAttribute('aria-hidden', 'true');
    await expect(page.locator('.lb-word')).toHaveText('Northvale');
    const g = await geometry(page);
    expect(g.ww / g.fw, 'spans most of the footer').toBeGreaterThan(0.9);
    expect(g.ww, 'but never overflows it').toBeLessThanOrEqual(g.fw);
    expect(g.wBottom, 'the bottom of the letters is cut off by the footer edge').toBeGreaterThan(g.fh + 20);
    expect(g.wTop, 'while the tops of the letters stay on show').toBeLessThan(g.fh - 120);
  });

  test('link columns have accent-coloured labels, and every link still works', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/northvale/');
    const colours = await page.$$eval('.lb h2', (hs) => hs.map((h) => getComputedStyle(h).color));
    expect(colours).toHaveLength(3);
    expect(new Set(colours).size, 'each label has its own accent colour').toBe(3);
    await expect(page.locator('#footer a[href="https://github.com/Overseerdotpy/concept-sites"]')).toHaveCount(1);
    await expect(page.locator('#footer .lb-in a.l[href^="mailto:"]')).toHaveAttribute('href', 'mailto:ashlundg1@gmail.com');
    await page.locator('#footer a[data-brand="logo"]').click();
    await expect(selected(page)).toHaveText('Brand');
    await expect(page.locator('button[data-brand="logo"]')).toHaveAttribute('aria-pressed', 'true');
    expect(await page.evaluate(() => scrollY), 'footer links return you to the top').toBeLessThan(5);
  });

  test('glassy social buttons: GitHub, Instagram and email, each with a name', async ({ page }) => {
    await page.goto('/northvale/');
    const links = page.locator('.lb-social a');
    await expect(links).toHaveCount(3);
    const names = await links.evaluateAll((as) => as.map((a) => a.getAttribute('aria-label')));
    expect(names[0]).toMatch(/GitHub/); expect(names[1]).toMatch(/Instagram/); expect(names[2]).toMatch(/Email/);
    expect(await links.evaluateAll((as) => as.map((a) => a.getAttribute('href')))).toEqual(['https://github.com/Overseerdotpy', 'https://www.instagram.com/ashlunnd/', 'mailto:ashlundg1@gmail.com']);
    for (const a of await links.all()) expect(await a.evaluate((e) => getComputedStyle(e).backdropFilter), 'frosted glass').toContain('blur');
    const box = await links.first().boundingBox();
    expect(Math.min(box.width, box.height), 'big enough to tap').toBeGreaterThanOrEqual(44);
  });

  test('has a copyright row between the links and the wordmark', async ({ page }) => {
    await page.goto('/northvale/');
    const legal = page.locator('.lb-legal');
    await expect(legal).toContainText('© 2026 Ash');
    await expect(legal).toContainText('fictional company');
    const [l, w] = await page.evaluate(() => [document.querySelector('.lb-legal').getBoundingClientRect().bottom, document.querySelector('.lb-word span').getBoundingClientRect().top]);
    expect(l, 'the copyright row sits above the wordmark').toBeLessThanOrEqual(w + 5);
  });

  test('a slow diagonal shaft of light drifts behind the links and through the letters', async ({ page }) => {
    await page.goto('/northvale/');
    const foot = page.locator('#footer');
    expect(await foot.evaluate((e) => getComputedStyle(e).animationName)).toBe('lb-drift');
    await foot.scrollIntoViewIfNeeded();
    const read = () => foot.evaluate((e) => parseFloat(getComputedStyle(e).getPropertyValue('--bx')));
    const a = await read(); await page.waitForTimeout(1500); const b = await read();
    expect(Math.abs(b - a), 'the beam position changes over time').toBeGreaterThan(0.2);
    const secs = await foot.evaluate((e) => parseFloat(getComputedStyle(e).animationDuration));
    expect(secs, 'a full sweep takes at least 15 seconds, so it is slow').toBeGreaterThanOrEqual(15);

    const z = await page.evaluate(() => ({ fx: getComputedStyle(document.querySelector('.lb-fx')).zIndex, word: getComputedStyle(document.querySelector('.lb-word')).zIndex, links: getComputedStyle(document.querySelector('.lb-in')).zIndex, ptr: getComputedStyle(document.querySelector('.lb-fx')).pointerEvents }));
    expect(Number(z.fx), 'the light is behind the wordmark').toBeLessThan(Number(z.word));
    expect(Number(z.word), 'which is behind the link columns').toBeLessThan(Number(z.links));
    expect(z.ptr, 'and never blocks a click').toBe('none');

    // the lit copy of the wordmark paints the footer's own gradients, lined up with the footer
    const lit = await page.evaluate(() => { const c = getComputedStyle(document.querySelector('.lb-word span'), '::after'); return { clip: c.webkitBackgroundClip || c.backgroundClip, size: c.backgroundSize, x: c.backgroundPositionX, y: c.backgroundPositionY }; });
    const g = await geometry(page);
    expect(lit.clip.split(',').map((v) => v.trim()), 'both light layers (glow and beam) are clipped to the letters').toEqual(['text', 'text']);
    expect(parseFloat(lit.size)).toBeCloseTo(g.fw, 0);
    expect(parseFloat(lit.size.split(' ')[1])).toBeCloseTo(g.fh, 0);
    expect(parseFloat(lit.x)).toBeCloseTo(g.left, 0);
    expect(parseFloat(lit.y)).toBeCloseTo(g.top, 0);
  });

  test('a glow follows the pointer and fades when it leaves', async ({ page }) => {
    await page.goto('/northvale/');
    const foot = page.locator('#footer');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const box = await foot.boundingBox();
    await page.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.5);
    await expect.poll(() => foot.evaluate((e) => e.style.getPropertyValue('--g'))).toBe('1');
    expect(parseFloat(await foot.evaluate((e) => e.style.getPropertyValue('--px')))).toBeCloseTo(box.width * 0.25, -1);
    await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.3);
    expect(parseFloat(await foot.evaluate((e) => e.style.getPropertyValue('--px')))).toBeCloseTo(box.width * 0.8, -1);
    expect(parseFloat(await foot.evaluate((e) => e.style.getPropertyValue('--py')))).toBeCloseTo(box.height * 0.3, -1);
    await page.mouse.move(5, 5);
    await expect.poll(() => foot.evaluate((e) => e.style.getPropertyValue('--g'))).toBe('0');
    await expect.poll(() => foot.evaluate((e) => parseFloat(getComputedStyle(e).getPropertyValue('--g'))), { timeout: 3000 }).toBe(0);
  });

  test('with reduced motion the light holds still and there is no pointer glow', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/northvale/');
    const foot = page.locator('#footer');
    expect(await foot.evaluate((e) => getComputedStyle(e).animationName)).toBe('none');
    expect(await foot.evaluate((e) => getComputedStyle(e).getPropertyValue('--bx').trim())).toBe('58%');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const box = await foot.boundingBox();
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
    await page.waitForTimeout(300);
    expect(await foot.evaluate((e) => e.style.getPropertyValue('--g'))).toBe('');
  });
});
