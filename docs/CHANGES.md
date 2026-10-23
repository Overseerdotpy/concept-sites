# What changed from the original designs

Obsidra and Amberline were designed as standalone pages. To publish them together I changed as little as possible and kept every visual decision. This is the complete list, so any change can be reviewed or reversed.

## Every page
- Private links to other pages (hosted elsewhere) now point to the matching page in this repo.
- Added a meta description and an inline favicon where they were missing.
- Links between pages of this site open in the same tab.

## Obsidra
| Page | Change | Why |
| --- | --- | --- |
| Landing page | Terminal secondary text (`.term .dim`, `.term dt`) from `#8C8A98` to `#B0AFBC` (the page's existing `--ink-300`). Contrast 3.64:1 to 5.66:1. | Failed WCAG AA (4.5:1 for small text). The global colour token is untouched, so nothing else shifts. |
| Landing page | `tabindex="0"` on the three scrollable `<code>` command lines. | Scrollable regions must be reachable by keyboard. |
| Dashboard | Alert text (`#hot-alert`) from `#8B640F` to `#7D590B`. Contrast 4.34:1 to 5.16:1. | Just under the AA threshold. |
| Dashboard | Sidebar entries for screens that were never designed are marked `aria-disabled="true"` and a small click guard stops them jumping the page. The wordmark links to the landing page. | They were dead `href="#"` links. |
| Case study | The white-on-violet "Deploy a cluster" swatch gets `data-specimen`. | It is the deliberate failing half of the contrast demonstration ("Fails WCAG AA"). The accessibility scan excludes elements marked as specimens, and a test checks there is exactly one. |
| Case study | Top bar (Ash, Work, About, Contact) links to the hub, the hub's work section, GitHub and email. | They were dead `#` links. |

## Amberline
| Page | Change | Why |
| --- | --- | --- |
| Landing, app, case study | Removed 8 embedded `<metadata>` blocks (content-credentials manifests) from the inline SVG logos, about 60 KB. | They are only valid attached to the original file, and their text made axe flag a label-in-name mismatch on the home link. The logos are drawn identically. |
| Landing page | On screens up to 480px the row of avatar faces is 44px instead of 56px. | Eight 56px faces overlapped to 380px, wider than a 390px phone. |
| App | `.cols>*{min-width:0}` | On narrow screens a grid column could not shrink below its table, so the page scrolled sideways. |
| App | `.table{position:relative}` | A hidden 1px screen-reader label inside the table was anchored to the page, escaped the table's scroll area and widened the whole page to 463px. |
| App | The invoice amount parser now accepts `1234`, `1,234`, `$1,234.50` and `.5`, and rejects everything else with "Enter an amount like 1,250 or 1,250.50." | It used to delete characters it did not understand, so `-5` became $5.00, `12abc` became $12 and `1.2.3` became $1.20. |
| App | `html2canvas` is served from `site/vendor/` instead of a CDN. | One less third-party request, and the page works offline. |
| App | Sidebar entries for undesigned screens are `aria-disabled`; the wordmark links to the landing page. | Same as the Obsidra dashboard. |
| Case study | Top bar links as above. | Dead `#` links. |

## Northvale Expeditions
Nine existing pages plus one new page, the combined page at `site/northvale/index.html`.

| Page | Change | Why |
| --- | --- | --- |
| Combined page (new) | Five tabs, each showing one part in an embedded frame, loaded the first time it is opened. It passes the messages the pages already used: website to booking, booking to trip, and the case study's buttons. Light beam footer (see the design notes). | You asked for the pages merged into one. The pages already contained hooks for a combined file (`window.__NV_HUB`, a comment about switching tabs, and message handlers), so this follows that design. |
| All pages | A tiny script, before anything else runs, sets `window.__NV_HUB` only when the page sits inside the combined page; a second script turns `data-hub` links into tab switches there. On their own, the pages behave as ordinary pages. | The pages need to know whether they are framed. |
| All pages | Removed 8 embedded `<metadata>` manifests from inline SVG logos. | Same reason as Amberline: they confuse label checks and are not valid once inlined. |
| Website | The booking link and the GSAP scripts are local (`../book/`, `site/vendor/gsap/`). | Private link and a CDN request. |
| Booking | **The "Go to your trip" link is now built after the booking exists.** Back links go to `../site/#trips`. | The link used to be built one line before the booking was created, so on its own the page opened the trip page on a default trip, not the one just booked (a second booking would even have carried the first one). Inside the combined page the message carried the booking, so it worked there. |
| Booking | `aria-level="2"` on the summary heading. | It was an `h3` straight after the `h1`, which broke the heading outline. Looks identical. |
| Trip page | The home link goes to `../site/`. | Private link. |
| Case study | Its four buttons go to the pages in this repo (or switch tabs); the top bar (Ash, Work, About, Contact) goes to the hub, GitHub and email and opens outside the frame. | Private links and dead `#` links. |
| Brand pages (5) | Metadata only. | None needed. |

## Design notes (left as designed)
- **Obsidra dashboard, "Pause".** It pauses the log feed only; the billing clock keeps running, which is correct for a billing product. The button just says "Pause" beside "Stop cluster", so it can read as pausing the meter. "Pause log" would remove the ambiguity.
- **Lighthouse layout shift.** Lighthouse reports one shift (0.165) on the Amberline app at desktop size and 0.071 on the Obsidra dashboard. A direct layout-shift observer sees none on either page, so I could not reproduce or fix it.
- **Northvale website weight.** It is one 2.2 MB file with 12 photographs embedded as base64. Moving them to separate compressed files would help mobile loading most.
- **Northvale light beam footer.** A re-creation of the 21st.dev "Light Beam Footer with Giant Wordmark" (Kedhareswer Naidu, MIT), built from its published description in plain HTML, CSS and JavaScript. The source code sits behind a 21st API key and I did not have it, so no code was copied, and details such as timings and exact gradients are my own. The colours are Northvale's (rust beam on a deep graphite-blue) rather than the component's default midnight navy.
