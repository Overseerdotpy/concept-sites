import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';

// The standalone Northvale file: one HTML file that holds seven pages and opens them in frames.
// It is added to the site exactly as delivered, so these tests check the file, they never edit it.
// Tracing records a snapshot at every step; for a 4.5 MB page full of frames that is slow enough to time out ordinary clicks.
test.use({ trace: 'off' });

const PATH = '/northvale/standalone/';
const FILE = 'site/northvale/standalone/index.html';
const TABS = ['landing', 'booking', 'trip', 'case-study', 'system', 'logo', 'anim'];
const LABEL = { landing: 'Landing page', booking: 'Booking', trip: 'Your trip', 'case-study': 'Case study', system: 'Brand system', logo: 'Logo', anim: 'Logo animation' };
const FOOTERS = { landing: 1, booking: 0, trip: 0, 'case-study': 1, system: 1, logo: 1, anim: 0 };   // pages that end in a footer

const selected = (page) => page.locator('#tabs button[aria-selected="true"]');
const view = (page, key) => page.frameLocator('#f-' + key);
const inner = async (page, key) => (await page.locator('#f-' + key).elementHandle()).contentFrame();
const open = async (page, hash = '') => { await page.goto(PATH + hash); await page.waitForSelector('#tabs button[aria-selected="true"]'); };
const go = async (page, key) => { await page.locator(`#tabs button[data-p="${key}"]`).click(); await expect(page.locator(`#f-${key}`)).toBeVisible(); };
const settle = (page, ms = 700) => page.waitForTimeout(ms);
const toEnd = async (page, key) => { const f = await inner(page, key); await f.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await settle(page, 400); return f; };
const hosts = (reqs) => [...new Set(reqs.map((r) => r.host))].filter((h) => h !== '127.0.0.1:4173' && !/^fonts\.(googleapis|gstatic)\.com$/.test(h));

// Walks a whole booking. `book` is the booking frame.
async function completeBooking(page, book) {
  await book.locator('#n1').click();
  await book.locator('#nm0').fill('Ash Gibson');
  await book.locator('#email').fill('ash@example.com');
  await book.locator('#n2').click();
  for (const yes of await book.locator('button:visible', { hasText: /^Yes/ }).all()) await yes.click();
  await book.locator('#n3').click();
  await book.locator('#n4').click();
  await book.locator('#cname').fill('Ash Gibson');
  await book.locator('#cnum').fill('4242 4242 4242 4242');
  await book.locator('#cexp').fill('12/30');
  await book.locator('#ccvc').fill('123');
  await book.locator('#pay').click();
  await expect(book.locator('#ref')).toContainText(/NV-\d{4}-\d{4}/, { timeout: 8000 });
  return (await book.locator('#ref').innerText()).match(/NV-\d{4}-\d{4}/)[0];
}

test.describe('the file itself', () => {
  test('is self-contained: no outside scripts, no private links, no leftover provenance data', async () => {
    const raw = readFileSync(FILE, 'utf8');
    expect(raw).not.toMatch(/<script[^>]+src="https?:/);
    expect(raw).not.toMatch(/claude\.ai/);
    expect(raw, 'logo provenance blocks are gone').not.toMatch(/xmlns:c2pa|c2pa:manifest|<metadata[ >]/i);
    expect(raw.match(/<script type="text\/plain" id="doc-/g), 'seven pages inside').toHaveLength(7);
    expect(raw.length, 'fits comfortably under the 16 MB limit for a hosted page').toBeLessThan(8 * 1024 * 1024);
  });

  test('opens on the landing page, makes no outside requests but its fonts, and has no errors', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const reqs = [], errors = [];
    page.on('request', (r) => reqs.push({ method: r.method(), host: new URL(r.url()).host }));
    page.on('pageerror', (e) => errors.push(e.message));
    await open(page);
    await settle(page, 1500);
    await expect(page.locator('#tabs button')).toHaveText(Object.values(LABEL).map((l) => new RegExp('^' + l + '$', 'i')));
    await expect(selected(page)).toHaveText(/landing page/i);
    expect(hosts(reqs), 'nothing is fetched from any other server').toEqual([]);
    expect(errors).toEqual([]);
  });

  test('makes no failed requests of its own, on any tab', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const failed = [];
    page.on('response', (r) => { if (r.status() >= 400) failed.push(r.status() + ' ' + new URL(r.url()).pathname); });
    page.on('requestfailed', (r) => { if (!/fonts\.(googleapis|gstatic)/.test(r.url())) failed.push('failed ' + r.url().slice(0, 80)); });
    await open(page); await settle(page, 1200);
    for (const key of TABS) { await go(page, key); await settle(page, 600); }
    expect(failed).toEqual([]);
  });

  test('the intro plays to the end by itself with no network, and can be skipped', async ({ page }) => {
    await open(page);
    const f = await inner(page, 'landing');
    await expect.poll(() => f.evaluate(() => !document.documentElement.classList.contains('intro')), { timeout: 20000, message: 'the intro finishes' }).toBe(true);
    expect(await f.evaluate(() => typeof gsap === 'object' && typeof ScrollTrigger !== 'undefined'), 'the animation library is inside the file').toBe(true);
    expect(await f.evaluate(() => { const r = document.querySelector('h1').getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight + 5; }), 'the headline is on screen').toBe(true);
    await expect.poll(() => f.evaluate(() => parseFloat(getComputedStyle(document.querySelector('h1')).opacity)), { timeout: 8000, message: 'and faded in' }).toBeGreaterThan(0.9);
  });

  test('"Skip intro" ends the intro early (the full intro runs about 7 seconds)', async ({ page }) => {
    await open(page);
    const f = await inner(page, 'landing');
    const t0 = Date.now();
    await f.locator('#skip').click({ timeout: 20000 });        // the click itself takes ~2 s: the intro starts leaving as you press
    await expect.poll(() => f.evaluate(() => !document.documentElement.classList.contains('intro')), { timeout: 20000 }).toBe(true);
    expect(Date.now() - t0, 'well before the full intro would have ended on its own').toBeLessThan(4500);
  });
});

test.describe('the tab bar', () => {
  test.beforeEach(async ({ page }) => { await page.emulateMedia({ reducedMotion: 'reduce' }); });

  test('arrow keys walk the tabs one at a time and focus stays on the bar', async ({ page }) => {
    await open(page);
    await page.locator('#tabs button[data-p="landing"]').focus();
    for (const next of ['booking', 'your trip', 'case study']) {
      await page.keyboard.press('ArrowRight');
      await expect(selected(page)).toHaveText(new RegExp('^' + next + '$', 'i'));
    }
    expect(await page.evaluate(() => !!document.activeElement.closest('#tabs')), 'focus did not jump into the page').toBe(true);
    await page.keyboard.press('ArrowLeft');
    await expect(selected(page)).toHaveText(/your trip/i);
  });

  test('Back and Forward move through the tabs you visited, instead of leaving the page', async ({ page }) => {
    await open(page);
    await go(page, 'trip'); await go(page, 'logo');
    await page.goBack();
    await expect(selected(page)).toHaveText(/your trip/i);
    await page.goBack();
    await expect(selected(page)).toHaveText(/landing page/i);
    await page.goForward();
    await expect(selected(page)).toHaveText(/your trip/i);
  });

  for (const key of TABS) {
    test(`a link ending #${key} opens ${LABEL[key]}`, async ({ page }) => {
      await open(page, '#' + key);
      await expect(selected(page)).toHaveText(new RegExp('^' + LABEL[key] + '$', 'i'));
      await expect(page.locator('#f-' + key)).toBeVisible();
      await expect(page).toHaveTitle('Northvale · ' + LABEL[key]);
    });
  }

  test('an unknown link falls back to the landing page', async ({ page }) => {
    await open(page, '#nonsense');
    await expect(selected(page)).toHaveText(/landing page/i);
  });

  test('messages from anything other than its own pages are ignored', async ({ page }) => {
    await open(page);
    await go(page, 'logo');
    await page.evaluate(() => window.postMessage({ hub: 'trip' }, '*'));
    await settle(page, 400);
    await expect(selected(page)).toHaveText(/^logo$/i);
  });

  test('only the page you are looking at is loaded', async ({ page }) => {
    await open(page);
    expect(await page.locator('iframe').count()).toBe(1);
    await go(page, 'booking');
    expect(await page.locator('iframe').count()).toBe(2);
  });
});

test.describe('one footer: the light beam footer', () => {
  test.beforeEach(async ({ page }) => { await page.emulateMedia({ reducedMotion: 'reduce' }); });

  for (const key of TABS) {
    test(`${LABEL[key]}: ${FOOTERS[key] ? 'ends in the light beam footer' : 'has no footer, as designed'}`, async ({ page }) => {
      await open(page, '#' + key);
      await settle(page, key === 'landing' ? 1500 : 900);
      const f = await inner(page, key);
      const n = await f.evaluate(() => { const vis = (e) => e.offsetWidth || e.offsetHeight; const all = [...document.querySelectorAll('footer')].filter(vis); return { visible: all.length, beam: all.filter((e) => e.classList.contains('lb')).length, old: document.querySelectorAll('footer.foot, footer.next, footer.wrap').length }; });
      expect(n).toEqual({ visible: FOOTERS[key], beam: FOOTERS[key], old: 0 });
    });
  }

  test('the wordmark spans the width, is cropped by the bottom edge, and is hidden from screen readers', async ({ page }) => {
    await open(page); await settle(page, 1500);
    const f = await toEnd(page, 'landing');
    const g = await f.evaluate(() => { const ft = document.querySelector('footer.lb'), w = ft.querySelector('.lb-word span'), fr = ft.getBoundingClientRect(), wr = w.getBoundingClientRect(); return { ratio: wr.width / fr.width, cropped: wr.bottom - fr.bottom, topIn: fr.bottom - wr.top, aria: ft.querySelector('.lb-word').getAttribute('aria-hidden'), text: ft.querySelector('.lb-word').textContent.trim() }; });
    expect(g.ratio).toBeGreaterThan(0.9); expect(g.ratio).toBeLessThanOrEqual(1);
    expect(g.cropped, 'the lower part of the letters is cut off').toBeGreaterThan(10);
    expect(g.topIn, 'while the tops stay on show').toBeGreaterThan(100);
    expect(g.aria).toBe('true'); expect(g.text).toBe('Northvale');
  });

  test('has glass social buttons, accent-coloured labels, a copyright row, and the brand sentence', async ({ page }) => {
    await open(page); await settle(page, 1500);
    const f = await toEnd(page, 'landing');
    const g = await f.evaluate(() => { const ft = document.querySelector('footer.lb'); const a = [...ft.querySelectorAll('.lb-social a')]; return { labels: a.map((x) => x.getAttribute('aria-label')), hrefs: a.map((x) => x.getAttribute('href')), blur: getComputedStyle(a[0]).backdropFilter, size: Math.min(a[0].getBoundingClientRect().width, a[0].getBoundingClientRect().height), colours: [...ft.querySelectorAll('h2')].map((h) => getComputedStyle(h).color), legal: ft.querySelector('.lb-legal').textContent, sentence: ft.textContent.includes('guides small groups into the high Alps, from the valley to the summit and safely home again'), id: ft.id }; });
    expect(g.labels.join('|')).toMatch(/GitHub.*Instagram.*Email/);
    expect(g.hrefs).toEqual(['https://github.com/Overseerdotpy', 'https://www.instagram.com/ashlunnd/', 'mailto:ashlundg1@gmail.com']);
    expect(g.blur).toContain('blur'); expect(g.size, 'big enough to tap').toBeGreaterThanOrEqual(44);
    expect(new Set(g.colours).size, 'three accent colours').toBe(3);
    expect(g.legal).toContain('© 2026 Ash'); expect(g.sentence).toBe(true);
    expect(g.id, 'the nav\'s "About" link points here').toBe('about');
  });

  test('the nav\'s "About" link scrolls to the footer', async ({ page }) => {
    await open(page); await settle(page, 1500);
    const f = await inner(page, 'landing');
    await f.locator('a[href="#about"]').first().click();
    await expect.poll(() => f.evaluate(() => { const r = document.querySelector('footer.lb').getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0; })).toBe(true);
  });

  for (const [text, id] of [['Our guides', 'guides'], ['The route', 'route'], ['Your first summit', 'trip-summit'], ['Am I ready?', 'ready']]) {
    test(`on the landing page, the footer's "${text}" scrolls to that section`, async ({ page }) => {
      await open(page); await settle(page, 1500);
      const f = await toEnd(page, 'landing');
      await f.locator('footer.lb a.l', { hasText: text }).click();
      await expect.poll(() => f.evaluate((i) => { const t = document.getElementById(i).getBoundingClientRect().top; return t > -60 && t < 500; }, id), { message: text }).toBe(true);
    });
  }

  for (const [text, tab] of [['Book a trip', 'booking'], ['Your trip', 'trip'], ['Case study', 'case-study'], ['Brand system', 'system'], ['Logo', 'logo']]) {
    test(`the footer's "${text}" opens ${LABEL[tab]}`, async ({ page }) => {
      await open(page); await settle(page, 1500);
      const f = await toEnd(page, 'landing');
      await f.locator('footer.lb a.l', { hasText: new RegExp('^' + text + '$') }).click();
      await expect(selected(page)).toHaveText(new RegExp('^' + LABEL[tab] + '$', 'i'));
    });
  }

  test('a footer on another page can send you to a section of the landing page', async ({ page }) => {
    await open(page, '#case-study'); await settle(page, 1000);
    const cs = await toEnd(page, 'case-study');
    await cs.locator('footer.lb a.l', { hasText: 'Our guides' }).click();
    await expect(selected(page)).toHaveText(/landing page/i);
    const lf = await inner(page, 'landing');
    await expect.poll(() => lf.evaluate(() => { const t = document.getElementById('guides').getBoundingClientRect().top; return t > -60 && t < 600; })).toBe(true);
  });

  test('the logo and brand pages keep their own caption in the copyright row', async ({ page }) => {
    await open(page, '#logo'); await settle(page, 900);
    expect(await (await inner(page, 'logo')).evaluate(() => document.querySelector('footer.lb .lb-legal').textContent)).toContain('Barlow Condensed Bold, outlined');
    await go(page, 'system'); await settle(page, 700);
    expect(await (await inner(page, 'system')).evaluate(() => document.querySelector('footer.lb .lb-legal').textContent)).toContain('Summit rust');
  });
});

test.describe('the light', () => {
  test('a slow beam drifts behind the links and through the letters, and a glow follows the pointer', async ({ page }) => {
    await open(page);
    const f = await inner(page, 'landing');
    // with motion on, the intro covers the whole page for about 7 seconds, footer included: wait for it to leave
    await expect.poll(() => f.evaluate(() => !document.documentElement.classList.contains('intro')), { timeout: 20000 }).toBe(true);
    await settle(page, 600);
    await toEnd(page, 'landing');
    const read = () => f.evaluate(() => parseFloat(getComputedStyle(document.querySelector('footer.lb')).getPropertyValue('--bx')));
    expect(await f.evaluate(() => getComputedStyle(document.querySelector('footer.lb')).animationName)).toBe('lb-drift');
    const a = await read(); await settle(page, 1400); const b = await read();
    expect(Math.abs(b - a), 'the beam moves').toBeGreaterThan(0.2);
    expect(await f.evaluate(() => parseFloat(getComputedStyle(document.querySelector('footer.lb')).animationDuration)), 'slowly').toBeGreaterThanOrEqual(15);
    const z = await f.evaluate(() => ({ fx: +getComputedStyle(document.querySelector('.lb-fx')).zIndex, w: +getComputedStyle(document.querySelector('.lb-word')).zIndex, l: +getComputedStyle(document.querySelector('.lb-in')).zIndex, pe: getComputedStyle(document.querySelector('.lb-fx')).pointerEvents, clip: getComputedStyle(document.querySelector('.lb-word span'), '::after').webkitBackgroundClip }));
    expect(z.fx).toBeLessThan(z.w); expect(z.w).toBeLessThan(z.l); expect(z.pe).toBe('none'); expect(z.clip).toContain('text');
    const box = await page.locator('#f-landing').boundingBox();
    const r = await f.evaluate(() => { const r = document.querySelector('footer.lb').getBoundingClientRect(); return { top: r.top, h: r.height, w: r.width }; });
    await page.mouse.move(box.x + r.w * 0.3, box.y + r.top + r.h * 0.5);
    await expect.poll(() => f.evaluate(() => document.querySelector('footer.lb').style.getPropertyValue('--g'))).toBe('1');
    expect(await f.evaluate(() => parseFloat(document.querySelector('footer.lb').style.getPropertyValue('--px')))).toBeCloseTo(r.w * 0.3, -1);
    await page.mouse.move(5, 5);
    await expect.poll(() => f.evaluate(() => document.querySelector('footer.lb').style.getPropertyValue('--g'))).toBe('0');
  });

  test('with reduced motion the light holds still and there is no pointer glow', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page); await settle(page, 1500);
    const f = await toEnd(page, 'landing');
    expect(await f.evaluate(() => getComputedStyle(document.querySelector('footer.lb')).animationName)).toBe('none');
    expect(await f.evaluate(() => getComputedStyle(document.querySelector('footer.lb')).getPropertyValue('--bx').trim())).toBe('58%');
    const box = await page.locator('#f-landing').boundingBox();
    await page.mouse.move(box.x + 400, box.y + box.height - 150); await settle(page, 300);
    expect(await f.evaluate(() => document.querySelector('footer.lb').style.getPropertyValue('--g'))).toBe('');
  });
});

test.describe('everything that acts like a backend (it all runs in the browser)', () => {
  test.beforeEach(async ({ page }) => { await page.emulateMedia({ reducedMotion: 'reduce' }); });

  for (const [label, trip, date] of [['Book 14 Jun', /hut-to-hut trek/i, '14 Jun'], ['Book 5 Jul', /first glacier crossing/i, '5 Jul'], ['Book 16 Aug', /your first summit/i, '16 Aug']]) {
    test(`choosing "${label}" on the landing page opens booking on that trip and date`, async ({ page }) => {
      await open(page); await settle(page, 1500);
      await view(page, 'landing').locator('a', { hasText: label }).first().click();
      await expect(selected(page)).toHaveText(/^booking$/i);
      await expect(view(page, 'booking').locator('#s-name')).toHaveText(trip);
      await expect(view(page, 'booking').locator('#s-dep')).toContainText(date);
    });
  }

  test('a whole booking sends nothing anywhere, and "Go to your trip" opens the trip you booked', async ({ page }) => {
    const reqs = [];
    page.on('request', (r) => reqs.push({ method: r.method(), host: new URL(r.url()).host }));
    await open(page); await settle(page, 1500);
    await view(page, 'landing').locator('a', { hasText: 'Book 14 Jun' }).first().click();
    const book = view(page, 'booking');
    const ref = await completeBooking(page, book);
    await book.locator('#to-trip').click();
    await expect(selected(page)).toHaveText(/your trip/i);
    await expect(view(page, 'trip').locator('h1'), 'the trek, not the trip page\'s default').toHaveText(/hut-to-hut trek/i);
    await expect(view(page, 'trip').locator('body')).toContainText(ref);
    expect(reqs.filter((r) => r.method !== 'GET'), 'nothing is posted').toEqual([]);
    expect(hosts(reqs), 'no other server is called').toEqual([]);
  });

  test('a full departure goes to a waitlist, checks the email, and offers no trip page', async ({ page }) => {
    await open(page, '#booking');
    const book = view(page, 'booking');
    await book.locator('#tripsel button').nth(2).click();
    await book.locator('#deps button', { hasText: /Full|waitlist/i }).first().click();
    await expect(book.locator('#wait-note')).toContainText('full');
    await expect(book.locator('#n1')).toHaveText('Join the waitlist');
    await book.locator('#n1').click();
    await expect(book.locator('[id$="-err"]:visible')).toHaveText('Enter your email so we can tell you when a seat opens.');
    await book.locator('#wemail').fill('nope'); await book.locator('#n1').click();
    await expect(book.locator('[id$="-err"]:visible')).toContainText("doesn't look like an email address");
    await book.locator('#wemail').fill('ash@example.com'); await book.locator('#n1').click();
    await expect(book.locator('#s6')).toHaveText(/on the waitlist/i);
    await expect(book.locator('#done-sub')).toContainText('ash@example.com');
    await expect(book.locator('#to-trip'), 'a waitlisted visitor has no trip to go to').toBeHidden();
  });

  test('seats are limited, and price, deposit and balance add up', async ({ page }) => {
    await open(page, '#booking');
    const book = view(page, 'booking');
    await book.locator('#tripsel button').nth(1).click();
    await book.locator('#deps button', { hasText: /^5 Jul/ }).click();
    await book.locator('#n1').click();
    await expect(book.locator('#seat-note')).toContainText('Up to 2');
    await book.locator('#plus').click();
    await expect(book.locator('#count')).toHaveText('2');
    await expect(book.locator('#plus')).toBeDisabled();
    await expect(book.locator('#s-trip-total')).toHaveText('$3,780');
    await expect(book.locator('#s-deposit')).toHaveText('$756');
    await expect(book.locator('#s-balance')).toContainText('$3,024 due 6 May 2027');
    await book.locator('#minus').click();
    await expect(book.locator('#s-deposit')).toHaveText('$378');
  });

  test('renting kit adds $95 each and needs a boot size, and the card form names each mistake', async ({ page }) => {
    await open(page, '#booking');
    const book = view(page, 'booking');
    await book.locator('#tripsel button').nth(1).click();
    await book.locator('#deps button', { hasText: /^5 Jul/ }).click();
    await book.locator('#n1').click();
    await book.locator('#n2').click();
    await expect(book.locator('#nm0-err')).toHaveText('Add a name, as it appears on their ID.');
    await expect(book.locator('#email-err')).toHaveText('Enter an email for your confirmation.');
    await book.locator('#nm0').fill('Ash Gibson'); await book.locator('#email').fill('ash@example.com'); await book.locator('#n2').click();
    await book.locator('#n3').click();
    await expect(book.locator('#chk-err')).toContainText('Answer each one');
    for (const yes of await book.locator('button:visible', { hasText: /^Yes/ }).all()) await yes.click();
    await book.locator('#n3').click();
    await book.locator('input[role="switch"]').first().check({ force: true });
    await expect(book.locator('#s-rent-total')).toHaveText('$95');
    await expect(book.locator('#s-total')).toHaveText('$1,985');
    await book.locator('#n4').click();
    await expect(book.locator('#boots-err')).toHaveText('Choose a boot size so your guide can fit the crampons.');
    await book.locator('#boots').selectOption({ index: 1 });
    await book.locator('#n4').click();
    await expect(book.locator('p.demo', { hasText: 'nothing is charged' })).toBeVisible();
    await book.locator('#pay').click();
    await expect(book.locator('#cname-err')).toHaveText('Enter the name shown on the card.');
    await expect(book.locator('#cnum-err')).toHaveText("Card numbers here are 16 digits. You've entered 0.");
    await expect(book.locator('#cexp-err')).toHaveText('Enter the expiry date.');
    await expect(book.locator('#ccvc-err')).toHaveText('Enter the 3 or 4 digits on the back of the card.');
    await book.locator('#cname').fill('Ash'); await book.locator('#cnum').fill('4242 4242 4242 424'); await book.locator('#cexp').fill('01/20'); await book.locator('#ccvc').fill('12');
    await book.locator('#pay').click();
    await expect(book.locator('#cnum-err')).toHaveText("Card numbers here are 16 digits. You've entered 15.");
    await expect(book.locator('#cexp-err')).toHaveText('Use a future date in MM/YY format, like 08/29.');
  });

  test('trip checklist and packing progress are saved in the browser, and survive a reload', async ({ page }) => {
    await open(page, '#trip');
    const trip = view(page, 'trip');
    await expect(trip.locator('#todo-prog')).toHaveText('0 of 5 done');
    await expect(trip.locator('#pack-prog')).toHaveText('0 of 14 packed');
    await trip.locator('label[for="tk-fitness"]').click();
    await trip.locator('label[for="pk-0-0"]').click();
    await expect(trip.locator('#todo-prog')).toHaveText('1 of 5 done');
    await expect(trip.locator('#pack-prog')).toHaveText('1 of 14 packed');
    expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('nv-trip-')))).toEqual(['nv-trip-NV-2027-4821']);
    await page.reload();
    await go(page, 'trip');
    await expect(view(page, 'trip').locator('#todo-prog')).toHaveText('1 of 5 done');
    await expect(view(page, 'trip').locator('#pack-prog')).toHaveText('1 of 14 packed');
  });
});

test.describe('quality', () => {
  for (const key of TABS) {
    test(`accessibility scan: ${LABEL[key]}`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await open(page, '#' + key); await settle(page, key === 'landing' ? 1500 : 900);
      const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      expect(violations.filter((v) => ['serious', 'critical'].includes(v.impact)).map((v) => `${v.id} (${v.nodes.length})`)).toEqual([]);
    });
  }

  for (const width of [320, 390, 768, 1360]) {
    test(`no sideways scroll at ${width}px on any of the seven pages`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.setViewportSize({ width, height: 860 });
      const errors = []; page.on('pageerror', (e) => errors.push(e.message));
      await open(page); await settle(page, 1200);
      const wide = [];
      for (const key of TABS) { await go(page, key); await settle(page, key === 'landing' ? 900 : 600); const f = await inner(page, key); if (await f.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) wide.push(key); }
      expect(wide).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'the tab bar fits').toBe(true);
      expect(errors, 'no errors on any page').toEqual([]);
    });
  }

  test('the case study heading is clean text (it used to carry the logo\'s embedded data)', async ({ page }) => {
    await open(page, '#case-study'); await settle(page, 900);
    expect((await (await inner(page, 'case-study')).evaluate(() => document.querySelector('h1').textContent.trim().replace(/\s+/g, ' ')))).toBe('Northvale Expeditions');
  });
});
