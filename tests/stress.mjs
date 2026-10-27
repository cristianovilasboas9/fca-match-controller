/* Stress test — "la génération de l'image bug parfois".
 *
 * Plays seeded random sequences of REAL user actions on an iPhone viewport
 * (tap a fixture, switch variant, story/post, edit the time, hero/decor options,
 * captain, sponsors, lineup, score, goals, tabs, messages, app restart) and
 * exports the card after each one through the real path (tap on the card).
 * Runs on chromium and webkit, under healthy / slow / flaky network profiles.
 *
 * An export is a FAILURE when it hangs (no result), errors, is silently dead,
 * has the wrong size, or is blank / partially painted.
 *
 *   node tests/stress.mjs                         # full matrix on the worktree
 *   node tests/stress.mjs --root /path/to/main    # same matrix on another checkout
 *   node tests/stress.mjs --engines webkit --profiles flaky --seeds 7 --steps 12
 *
 * Exit code 0 only if every export of every run succeeded.
 */
import fs from 'node:fs';
import path from 'node:path';
import { startServer, openApp, exportViaTap, expectedSize, rng, PROFILES, ROOT, OUT_DIR, CACHE_DIR, sleep } from './lib.mjs';

const arg = (name, dflt) => {
  const i = process.argv.indexOf('--' + name);
  return i > 0 ? process.argv[i + 1] : dflt;
};
const root = path.resolve(arg('root', ROOT));
const engines = arg('engines', 'chromium,webkit').split(',');
const profiles = arg('profiles', 'ok,slow,flaky').split(',');
const seeds = arg('seeds', '11,23').split(',').map(Number);
const steps = Number(arg('steps', '10'));
const label = arg('label', 'stress');
const concurrency = Number(arg('concurrency', '3'));

/* ---------- real-user action catalogue ---------- */
async function tap(page, locator) {
  try {
    await locator.scrollIntoViewIfNeeded({ timeout: 3000 });
    await locator.tap({ timeout: 4000 });
  } catch (e) {
    /* covered by the fixed bottom bar: a real thumb would scroll a bit more */
    await locator.evaluate((el) => { el.scrollIntoView({ block: 'center' }); el.click(); });
  }
}
async function gotoTab(page, s) {
  const tab = page.locator(`#section-tabs .tab[data-s="${s}"]`);
  if (!(await tab.count())) return false;
  await tap(page, tab);
  return true;
}
const st = (page) => page.evaluate(() => {
  const s = window.__mc.state;
  return { variant: s.variant, format: s.format, section: s.activeSection, matchId: s.matchId, opp: s.opponentSlug,
    goals: s.goals.length, score: `${s.score.home}-${s.score.away}`, heroOff: s.heroOff, heroPlayerId: s.heroPlayerId,
    heroSceneId: s.heroSceneId, sceneId: s.sceneId, custom: !!s.customHeroImage, sponsors: s.matchBallSponsors.length,
    photo: s.heroPhoto && s.heroPhoto.id, frame: `${s.visualPos.x}/${s.visualPos.y}@${s.visualZoom}·fx${s.visualFx}` };
});

const ACTIONS = {
  async switchVariant(page, rnd) {
    await gotoTab(page, 'variant');
    const cur = (await st(page)).variant;
    const ids = (await page.locator('.variant-card').evaluateAll(els => els.map(e => e.dataset.v))).filter(v => v !== cur);
    const v = rnd.pick(ids);
    await tap(page, page.locator(`.variant-card[data-v="${v}"]`));
    return `variant → ${v}`;
  },
  async switchTab(page, rnd) {
    const tabs = await page.locator('#section-tabs .tab').evaluateAll(els => els.map(e => e.dataset.s));
    const s = rnd.pick(tabs);
    await gotoTab(page, s);
    return `onglet → ${s}`;
  },
  async pickMatch(page, rnd) {
    await gotoTab(page, 'match');
    if (rnd.chance(0.35)) {
      const seg = page.locator('.match-seg button');
      await tap(page, seg.nth(rnd.int(await seg.count())));
    }
    const rows = page.locator('.match-row');
    const n = await rows.count();
    if (!n) return 'match : liste vide';
    const row = rows.nth(rnd.int(n));
    const mid = await row.getAttribute('data-mid');
    await tap(page, row);
    return `match → ${mid.slice(0, 8)}`;
  },
  async toggleFormat(page, rnd) {
    const target = (await st(page)).format === 'post' ? 'story' : 'post';
    const btn = page.locator(`#format-toggle .ft-btn[data-fmt="${target}"]`);
    if (await btn.isDisabled()) { await btn.evaluate(el => el.click()); return `format ${target} (bouton grisé)`; }
    await tap(page, btn);
    return `format → ${target}`;
  },
  async editTime(page, rnd) {
    await gotoTab(page, 'match');
    const t = rnd.pick(['14:30', '15:00', '20:15', '10:45', '19:', '']);
    const input = page.locator('#time-input');
    await input.scrollIntoViewIfNeeded();
    await input.fill('');
    if (t) await input.pressSequentially(t, { delay: 20 });
    return `heure → « ${t} »`;
  },
  async heroOption(page, rnd) {
    await gotoTab(page, 'visual');
    const kind = rnd.pick(['player', 'player', 'auto', 'scene', 'scene', 'shooting', 'sameAgain']);
    /* Boss 27.10 · onglet Fond en familles repliées : ouvrir la bonne famille avant de toucher ses vignettes */
    const family = { player: 'players', auto: 'players', sameAgain: 'players', scene: 'decor', shooting: 'shooting' }[kind];
    if (!(await page.evaluate((f) => window.__mc.state._familyOpen === f, family))) await tap(page, page.locator(`#fam-${family}`));
    if (kind === 'auto') { await tap(page, page.locator('[onclick="setHeroPlayer(\'\')"]')); return 'visage → auto'; }
    if (kind === 'player' || kind === 'sameAgain') {
      const tiles = page.locator('[onclick^="setHeroPlayer(\'"]:not([onclick="setHeroPlayer(\'\')"])');
      const n = await tiles.count();
      if (!n) return 'visage : aucun joueur';
      const i = rnd.int(n);
      await tap(page, tiles.nth(i));
      if (kind === 'sameAgain') { await tap(page, tiles.nth(i)); return `visage → joueur ${i} puis retiré (carte nette)`; }
      return `visage → joueur ${i}`;
    }
    if (kind === 'scene') {
      const tiles = page.locator('[onclick^="setScene("]');
      const n = await tiles.count();
      const i = rnd.int(n);
      await tap(page, tiles.nth(i));
      return `décor → tuile ${i}/${n}`;
    }
    /* shooting photo as the main visual */
    const shots = page.locator('[onclick^="setHeroScene("]');
    const n = await shots.count();
    if (!n) return 'shooting : aucune photo (bundle absent)';
    const i = rnd.int(n);
    await tap(page, shots.nth(i));
    return `visuel → shooting ${i}/${n}`;
  },
  async uploadHero(page, rnd) {
    await gotoTab(page, 'visual');
    const files = fs.readdirSync(CACHE_DIR).filter(f => f.endsWith('.json'))
      .map(f => JSON.parse(fs.readFileSync(path.join(CACHE_DIR, f), 'utf8')))
      .filter(m => m.status === 200 && /\/decors\//.test(m.url));
    if (!files.length) return 'import : aucune image de test en cache';
    const m = rnd.pick(files);
    const key = (await import('node:crypto')).createHash('sha1').update(m.url).digest('hex');
    await page.locator('#hero-upload').setInputFiles({ name: 'photo.webp', mimeType: 'image/webp', buffer: fs.readFileSync(path.join(CACHE_DIR, key + '.bin')) });
    await page.waitForFunction(() => !!window.__mc.state.customHeroImage, null, { timeout: 5000 }).catch(() => {});
    return 'visuel → photo importée';
  },
  /* a match photo (photos/manifest.json) as the visual (Boss 26.10) */
  async matchPhoto(page, rnd) {
    await gotoTab(page, 'visual');
    if (!(await page.locator('.mp-thumb').count())) await tap(page, page.locator('#mp-toggle'));
    await page.waitForSelector('.mp-thumb', { timeout: 8000 }).catch(() => {});
    const thumbs = page.locator('.mp-thumb');
    const n = await thumbs.count();
    if (!n) return 'photos du match : grille vide';
    const i = rnd.int(n);
    await tap(page, thumbs.nth(i));
    return `visuel → photo du match ${i}/${n}`;
  },
  /* framing of a full-frame photo: drag on the card, size, effects, Recentrer */
  async framePhoto(page, rnd) {
    if (await page.locator('#photo-tools').isHidden()) return null;
    const kind = rnd.pick(['drag', 'drag', 'zoom', 'fx', 'recenter']);
    if (kind === 'zoom') { await page.locator('#pt-zoom').fill(String(100 + rnd.int(201))); return 'cadrage : taille'; }
    if (kind === 'fx') { await page.locator('#pt-fx').fill(String(rnd.int(201))); return 'cadrage : effets'; }
    if (kind === 'recenter') { await tap(page, page.locator('#pt-recenter')); return 'cadrage : recentrer'; }
    await page.evaluate(() => window.scrollTo(0, 0));
    const box = await page.locator('#preview-tap .preview-inner').boundingBox();
    if (!box) return null;
    const x = box.x + box.width * (0.3 + 0.4 * rnd()), y = box.y + box.height * (0.3 + 0.4 * rnd());
    const dx = (rnd() - 0.5) * 240, dy = (rnd() - 0.5) * 240;
    await page.mouse.move(x, y);
    await page.mouse.down();
    for (let i = 1; i <= 6; i++) await page.mouse.move(x + dx * i / 6, y + dy * i / 6);
    await page.mouse.up();
    return `cadrage : glisser ${Math.round(dx)},${Math.round(dy)}`;
  },
  async captain(page, rnd) {
    await gotoTab(page, 'match');
    const tiles = page.locator('[onclick^="setCaptain("]');
    const n = await tiles.count();
    if (!n) return 'capitaine : aucun joueur';
    await tap(page, tiles.nth(rnd.int(n)));
    return 'capitaine changé';
  },
  async sponsor(page, rnd) {
    await gotoTab(page, 'customize');   // Boss 27.10 : les ballons de match sont dans « Personnaliser »
    const rm = page.locator('.sponsor-rm');
    if ((await rm.count()) && rnd.chance(0.4)) { await tap(page, rm.first()); return 'parrain retiré'; }
    const name = rnd.pick(['TECHAUTO AG', 'Barbey Frères SA', 'Garage du Lac', 'Boulangerie Müller & Fils Sàrl']);
    await page.locator('#sponsor-name').fill(name);
    await tap(page, page.locator('.sponsor-add-btn'));
    return `parrain + ${name}`;
  },
  async score(page, rnd) {
    if (!(await gotoTab(page, 'score'))) return null;
    const btns = page.locator('.score-stepper button');
    const k = 1 + rnd.int(3);
    for (let i = 0; i < k; i++) await tap(page, btns.nth(rnd.int(await btns.count())));
    const mn = page.locator('#minute-input');
    if (await mn.count()) await mn.fill(String(1 + rnd.int(95)));
    return `score : ${k} ± + minute`;
  },
  async goal(page, rnd) {
    if (!(await gotoTab(page, 'goal'))) return null;
    await page.locator('#minute-input').fill(String(1 + rnd.int(92)));
    const kind = rnd.pick(['scorer', 'scorer', 'scorer', 'away', 'undo', 'editMinute', 'changeScorer']);
    if (kind === 'away') {
      await tap(page, page.locator('.toggle-pair button').nth(1));
      await tap(page, page.locator('[onclick="logAwayGoal()"]'));
      if (rnd.chance(0.5)) await tap(page, page.locator('.toggle-pair button').nth(0));
      return 'but adverse';
    }
    if (kind === 'undo' && await page.locator('[onclick="undoGoal()"]').count()) { await tap(page, page.locator('[onclick="undoGoal()"]')); return 'but annulé'; }
    if (kind === 'editMinute' && await page.locator('.g-min-input').count()) {
      const el = page.locator('.g-min-input').first();
      await el.fill(String(1 + rnd.int(90))); await el.blur();
      return 'minute de but corrigée';
    }
    if (kind === 'changeScorer' && await page.locator('select.g-scorer').count()) {
      const sel = page.locator('select.g-scorer').first();
      const opts = await sel.locator('option').evaluateAll(els => els.map(e => e.value));
      await sel.selectOption(rnd.pick(opts));
      return 'buteur corrigé';
    }
    if ((await st(page)).section === 'goal' && !(await page.locator('#scorer-grid .player-mini').count())) await tap(page, page.locator('.toggle-pair button').nth(0));
    const tiles = page.locator('#scorer-grid .player-mini');
    const n = await tiles.count();
    if (!n) return 'but : aucun joueur';
    await tap(page, tiles.nth(rnd.int(n)));
    return 'but FCA';
  },
  async lineup(page, rnd) {
    if (!(await gotoTab(page, 'lineup'))) return null;
    const kind = rnd.pick(['slot', 'slot', 'slot', 'formation', 'bench', 'guest', 'manage']);
    if (kind === 'formation') {
      const f = rnd.pick(['4-3-3', '4-4-2', '4-2-3-1', '3-5-2', '5-3-2', '3-4-3']);
      await page.locator('#formation-select').selectOption(f);
      return `formation → ${f}`;
    }
    if (kind === 'bench') {
      const tiles = page.locator('#bench-grid .player-mini');
      const n = await tiles.count();
      const k = 1 + rnd.int(4);
      for (let i = 0; i < k && n; i++) await tap(page, tiles.nth(rnd.int(n)));
      return `banc : ${k} taps`;
    }
    if (kind === 'guest') {
      await page.locator('#guest-first').fill('Invité');
      await page.locator('#guest-last').fill(rnd.pick(['Dupont', 'Müller', 'De La Fontaine-Rochat']));
      await page.locator('#guest-jersey').fill(String(40 + rnd.int(50)));
      await tap(page, page.locator('.guest-add-btn'));
      return 'invité ajouté';
    }
    const filled = page.locator('#pitch-board .pitch-slot.filled');
    if (kind === 'manage' && await filled.count()) {
      await tap(page, filled.nth(rnd.int(await filled.count())));
      await page.waitForSelector('#player-sheet.show', { timeout: 3000 });
      await sleep(350);
      const act = rnd.pick(['.act-cap', '.act-rm', '.act-rep']);
      await tap(page, page.locator(`#sheet-actions ${act}`));
      if (act === '.act-rep') {
        const c = page.locator('#sheet-grid .player-mini:not(.disabled)');
        await tap(page, c.nth(rnd.int(await c.count())));
      }
      return `compo : action ${act}`;
    }
    const k = 1 + rnd.int(4);
    for (let i = 0; i < k; i++) {
      const empty = page.locator('#pitch-board .pitch-slot.empty');
      const n = await empty.count();
      if (!n) break;
      await tap(page, empty.nth(rnd.int(n)));
      await page.waitForSelector('#player-sheet.show', { timeout: 3000 });
      await sleep(350);
      const c = page.locator('#sheet-grid .player-mini:not(.disabled)');
      const m = await c.count();
      if (!m) { await page.evaluate(() => window.closeSheet()); break; }
      await tap(page, c.nth(rnd.int(m)));
      await sleep(120);
    }
    return `compo : ${k} joueur(s) placé(s)`;
  },
  async customMsg(page, rnd) {
    await gotoTab(page, 'customize');
    const v = rnd.pick(['Soirée grillades dès 12h', 'Match décisif — venez nombreux !', '']);
    await page.locator('#custom-msg-input').fill(v);
    return `message → « ${v} »`;
  },
  async caption(page, rnd) {
    await gotoTab(page, 'caption');
    await page.locator('#cap-hook').fill('ALLEZ LES BLEUS ' + rnd.int(100));
    return 'caption éditée';
  },
  /* iOS kills the standalone PWA in the background: reopening it is nominal. */
  async restart(page) {
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => !!document.querySelector('#poster-root #poster-node'), null, { timeout: 30000 });
    return 'app relancée (reprise du snapshot)';
  },
};
const WEIGHTS = { switchVariant: 6, switchTab: 3, pickMatch: 5, toggleFormat: 3, editTime: 2, heroOption: 5, uploadHero: 1,
  matchPhoto: 2, framePhoto: 3,
  captain: 1, sponsor: 2, score: 3, goal: 4, lineup: 4, customMsg: 1, caption: 1, restart: 2 };
const BAG = Object.entries(WEIGHTS).flatMap(([k, w]) => Array(w).fill(k));

/* Is the on-screen card what the state says it should be? (a render that bailed
   on an exception, or an asset that reached its cache without a redraw, leaves
   it stale). Assets land continuously on a slow network and the redraw is
   debounced, so a mismatch only counts when it PERSISTS for 1.5 s. */
async function previewStale(page) {
  let last = null;
  for (let k = 0; k < 6; k++) {
    last = await page.evaluate(() => {
      if (typeof posterHTML !== 'function') return null;
      const live = document.getElementById('poster-root');
      const tmp = document.createElement('div');
      try { tmp.innerHTML = posterHTML(); } catch (e) { return 'posterHTML() lève : ' + e.message; }
      const a = live.innerHTML, b = tmp.innerHTML;
      if (a === b) return null;
      let i = 0; while (i < a.length && a[i] === b[i]) i++;
      const cut = (x) => x.slice(Math.max(0, i - 50), i + 70).replace(/data:[^'")]{30,}/g, 'data:…').replace(/\s+/g, ' ');
      return `aperçu ≠ état · écran « ${cut(a)} » / attendu « ${cut(b)} »`;
    });
    if (!last) return null;
    await sleep(300);
  }
  return last;
}

async function runOne(appUrl, engine, profileName, seed) {
  const rnd = rng(seed * 7919 + engine.length * 31 + profileName.length);
  const app = await openApp(engine, appUrl, { profile: PROFILES[profileName], seed });
  const { page } = app;
  const rows = [];
  await sleep(1200);
  for (let i = 0; i < steps; i++) {
    const errBefore = app.errors.length;
    let name, desc;
    for (let tries = 0; tries < 8 && !desc; tries++) {
      name = rnd.pick(BAG);
      try { desc = await ACTIONS[name](page, rnd); }
      catch (e) { desc = `${name} ✗ pilote : ${String(e.message || e).split('\n')[0].slice(0, 140)}`; await page.evaluate(() => { try { window.closeSheet(); } catch (e) {} }); }
    }
    await sleep(250);
    const before = await st(page);
    const stale = await previewStale(page);
    const res = await exportViaTap(page);
    const want = expectedSize(before.variant, before.format);
    let verdict = 'ok';
    if (res.status !== 'ok') verdict = res.status;
    else if (res.png.w !== want.w || res.png.h !== want.h) verdict = 'wrong-size';
    else if (res.png.blank) verdict = 'blank';
    else if (res.png.partial) verdict = 'partial';
    const row = { i, action: desc, variant: before.variant, format: before.format, section: before.section, verdict,
      ms: res.ms, message: res.message || '', png: res.png || null, stale,
      /* aborted/stalled requests are the test's own doing, not app errors */
      errors: app.errors.slice(errBefore).map(e => e.msg).filter(m => !/Failed to load resource|due to access control checks/.test(m)) };
    rows.push(row);
    const mark = verdict === 'ok' ? '·' : '✗';
    console.log(`[${engine}/${profileName}/s${seed}] ${String(i).padStart(2)} ${mark} ${verdict.padEnd(10)} ${String(res.ms).padStart(6)}ms ${before.variant}/${before.format} tab=${before.section} | ${desc}${res.message ? ' | ' + res.message : ''}${stale ? ' | STALE: ' + stale : ''}${row.errors.length ? ' | JS: ' + row.errors[0].slice(0, 120) : ''}`);
  }
  await app.close();
  return { engine, profile: profileName, seed, rows };
}

const srv = await startServer(root);
const jobs = [];
for (const engine of engines) for (const p of profiles) for (const s of seeds) jobs.push([engine, p, s]);
const results = [];
let cursor = 0;
await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, async () => {
  while (cursor < jobs.length) {
    const [engine, p, s] = jobs[cursor++];
    try { results.push(await runOne(srv.url, engine, p, s)); }
    catch (e) { console.log(`[${engine}/${p}/s${s}] RUN CRASHED: ${e.message}`); results.push({ engine, profile: p, seed: s, rows: [], crashed: String(e.message) }); }
  }
}));
await srv.close();

/* ---------- summary ---------- */
let bad = 0;
console.log('\n=== SUMMARY · root=' + root + ' ===');
for (const engine of engines) {
  const rs = results.filter(r => r.engine === engine);
  const rows = rs.flatMap(r => r.rows.map(x => ({ ...x, profile: r.profile, seed: r.seed })));
  const by = {};
  rows.forEach(r => { by[r.verdict] = (by[r.verdict] || 0) + 1; });
  const fails = rows.filter(r => r.verdict !== 'ok');
  const stale = rows.filter(r => r.stale).length;
  const jsErr = rows.filter(r => r.errors.length).length;
  const okMs = rows.filter(r => r.verdict === 'ok').map(r => r.ms).sort((a, b) => a - b);
  bad += fails.length + rs.filter(r => r.crashed).length;
  console.log(`${engine}: ${rows.length} exports · ${JSON.stringify(by)} · aperçu périmé: ${stale} · étapes avec erreur JS: ${jsErr} · export ok médiane ${okMs[Math.floor(okMs.length / 2)] || '-'}ms max ${okMs[okMs.length - 1] || '-'}ms`);
  for (const p of profiles) {
    const pr = rows.filter(r => r.profile === p);
    console.log(`   ${p.padEnd(6)} ${pr.filter(r => r.verdict === 'ok').length}/${pr.length} ok`);
  }
  fails.forEach(f => console.log(`   ✗ ${f.profile}/s${f.seed} #${f.i} ${f.verdict} ${f.variant}/${f.format} tab=${f.section} — ${f.action} — ${f.message}`));
}
const file = path.join(OUT_DIR, `${label}.json`);
fs.writeFileSync(file, JSON.stringify({ root, engines, profiles, seeds, steps, results }, null, 1));
console.log('détail → ' + file);
process.exit(bad ? 1 : 0);
