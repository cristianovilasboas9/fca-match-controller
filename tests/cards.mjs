/* Exports the match announcement cards for a set of fixtures — the images
 * a human looks at to validate a redesign (before/after).
 *
 *   node tests/cards.mjs --tag after                       # worktree → validation-cartes-1010/after-*.png
 *   node tests/cards.mjs --root /path/to/main --tag before # another checkout, same fixtures
 *   node tests/cards.mjs --tag after --variants matchday,kickoff --engine webkit
 */
import path from 'node:path';
import { startServer, openApp, exportViaTap, PROFILES, ROOT, sleep } from './lib.mjs';

const arg = (name, dflt) => { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : dflt; };
const root = path.resolve(arg('root', ROOT));
const outDir = path.resolve(arg('out', path.join(ROOT, 'validation-cartes-1010')));
const tag = arg('tag', 'after');
const engine = arg('engine', 'chromium');
const variants = arg('variants', 'matchday').split(',');
const only = arg('only', '');

/* one home, one away, one with a very long opponent name (+ the long away one) */
const FIXTURES = [
  { key: 'home-slavia',      slug: 'fc-slavia-ls',            homeAway: 'home' },
  { key: 'away-aigle',       slug: 'fc-aigle-ii',             homeAway: 'away' },
  { key: 'long-racing',      slug: 'racing-club-lausanne-ii', homeAway: 'home' },
  { key: 'long-away-latour', slug: 'cs-la-tour-de-peilz-ii',  homeAway: 'away' },
].filter(f => !only || only.split(',').includes(f.key));

const srv = await startServer(root);
const app = await openApp(engine, srv.url, { profile: PROFILES.ok });
const { page } = app;
/* the season bundle must be in (fixture ids are the site's UUIDs) */
await page.waitForFunction(() => window.__mc.MATCHES.length > 0 && /-/.test(window.__mc.MATCHES[0].id), null, { timeout: 20000 });
const done = [];
for (const fx of FIXTURES) {
  const m = await page.evaluate((fx) => {
    const M = window.__mc.MATCHES.find(x => x.opponentSlug === fx.slug && x.homeAway === fx.homeAway);
    return M ? { id: M.id, comp: M.comp } : null;
  }, fx);
  if (!m) { console.log(`✗ ${fx.key}: fixture introuvable`); continue; }
  await page.locator('#section-tabs .tab[data-s="match"]').tap();
  const seg = { amical: 0, championnat: 1, coupe: 2 }[m.comp];
  await page.locator('.match-seg button').nth(seg).tap();
  await page.locator(`.match-row[data-mid="${m.id}"]`).tap();
  for (const variant of variants) {
    await page.locator('#section-tabs .tab[data-s="variant"]').tap();
    await page.locator(`.variant-card[data-v="${variant}"]`).tap();
    for (const format of ['story', 'post']) {
      const btn = page.locator(`#format-toggle .ft-btn[data-fmt="${format}"]`);
      if (await btn.isDisabled()) continue;
      await btn.tap();
      await sleep(1800);   // crest, cutout and sponsor logos of this fixture land in their caches
      const file = path.join(outDir, `${tag}-${fx.key}-${variant === 'matchday' ? '' : variant + '-'}${format}.png`);
      const r = await exportViaTap(page, { save: file });
      console.log(`${r.status === 'ok' ? '·' : '✗'} ${path.relative(ROOT, file)} ${r.status} ${r.png ? r.png.w + 'x' + r.png.h : r.message}`);
      done.push(file);
    }
  }
}
await app.close();
await srv.close();
