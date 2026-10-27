/* Showcase export for Boss: in-match variants + announcement cards with the shooting photos.
 *   node tests/showcase.mjs            -> validation-cartes-1010/showcase/*.png */
import path from 'node:path';
import fs from 'node:fs';
import { startServer, openApp, exportViaTap, PROFILES, ROOT, sleep } from './lib.mjs';

const outDir = path.join(ROOT, 'validation-cartes-1010', 'showcase');
fs.mkdirSync(outDir, { recursive: true });
const srv = await startServer(ROOT);
const app = await openApp('chromium', srv.url, { profile: PROFILES.ok });
const { page } = app;
await page.waitForFunction(() => window.__mc.MATCHES.length > 0 && /-/.test(window.__mc.MATCHES[0].id), null, { timeout: 20000 });

const tab = (s) => page.locator(`#section-tabs .tab[data-s="${s}"]`).tap();
const pickFixture = async (slug, homeAway) => {
  const m = await page.evaluate(({ slug, homeAway }) => {
    const M = window.__mc.MATCHES.find(x => x.opponentSlug === slug && x.homeAway === homeAway);
    return M ? { id: M.id, comp: M.comp } : null;
  }, { slug, homeAway });
  await tab('match');
  await page.locator('.match-seg button').nth({ amical: 0, championnat: 1, coupe: 2 }[m.comp]).tap();
  await page.locator(`.match-row[data-mid="${m.id}"]`).tap();
};
const shoot = async (variant, format, name) => {
  await tab('variant');
  await page.locator(`.variant-card[data-v="${variant}"]`).tap();
  const btn = page.locator(`#format-toggle .ft-btn[data-fmt="${format}"]`);
  if (await btn.isDisabled()) { console.log(`- ${name}: format ${format} indisponible`); return; }
  await btn.tap();
  await sleep(2200);
  const r = await exportViaTap(page, { save: path.join(outDir, name + '.png') });
  console.log(`${r.status === 'ok' ? '·' : '✗'} ${name} ${r.status} ${r.png ? r.png.w + 'x' + r.png.h : r.message}`);
};

/* ---------- A. pendant le match : FC Atlantic Vevey 2 - 1 FC Slavia LS ---------- */
const PART = (process.argv.includes('--part') ? process.argv[process.argv.indexOf('--part') + 1] : 'AB');
if (PART.includes('A')) {
await pickFixture('fc-slavia-ls', 'home');
/* a real starting eleven (4-3-3) + bench, taken from the roster by position */
const squad = await page.evaluate(() => {
  const { state, ROSTER } = window.__mc;
  const by = (re) => ROSTER.filter(p => re.test(String(p.position)));
  const gk = by(/^G/i), def = by(/^D/i), mid = by(/^M/i), att = by(/^A|^F/i);
  const eleven = [gk[0], ...def.slice(0, 4), ...mid.slice(0, 3), ...att.slice(0, 3)].filter(Boolean);
  state.formation = '4-3-3';
  state.lineupStarters = eleven.map(p => String(p.id)).concat(Array(11).fill('')).slice(0, 11);
  const used = new Set(state.lineupStarters);
  state.lineupBench = ROSTER.filter(p => !used.has(String(p.id))).slice(0, 5).map(p => String(p.id));
  return { positions: [...new Set(ROSTER.map(p => p.position))], a: String(att[0].id), b: String(mid[0].id), n: eleven.length };
});
console.log('squad', JSON.stringify(squad));
const G = [
  { minute: 23, playerId: squad.a, side: 'home', ts: 1 },
  { minute: 51, playerId: '', side: 'away', ts: 2 },
  { minute: 67, playerId: squad.b, side: 'home', ts: 3 },
];
const setLive = (minute, goals, scorerId = '') => page.evaluate(({ minute, goals, scorerId }) => {
  const { state } = window.__mc;
  state.minute = minute; state.goals = goals;
  state.score = { home: goals.filter(g => g.side === 'home').length, away: goals.filter(g => g.side === 'away').length };
  state.scorerId = scorerId; state.scorerSide = 'home';
}, { minute, goals, scorerId });
await setLive(0, []);
await shoot('lineup', 'story', 'A-match-lineup-story');
await setLive(45, G.slice(0, 1));
await shoot('halftime', 'story', 'A-match-halftime-story');
await setLive(58, G.slice(0, 2));
await shoot('live-score', 'story', 'A-match-live-score-story');
await setLive(67, G, squad.b);
await shoot('goal', 'story', 'A-match-goal-story');
await setLive(90, G);
await shoot('recap', 'story', 'A-match-recap-story');
await shoot('recap', 'post', 'A-match-recap-post');
}
if (!PART.includes('B')) { await app.close(); await srv.close(); process.exit(0); }

/* ---------- B. cartes d'annonce avec les photos du shooting ---------- */
await page.evaluate(() => { window.__mc.state.goals = []; });
await tab('visual');
await page.evaluate(() => window.toggleShooting());
await sleep(600);
const scenes = await page.evaluate(() => [...document.querySelectorAll('.hero-mini[onclick^="setHeroScene"]')]
  .map(e => ({ id: e.getAttribute('onclick').match(/'([^']+)'/)[1], label: e.querySelector('.hero-name').textContent.trim() })));
console.log('shooting:', scenes.length, scenes.map(s => s.label).join(' | '));
const picks = [0, 3, 6, 9, 12].filter(i => i < scenes.length).map(i => scenes[i]);
let n = 0;
for (const s of picks) {
  n++;
  await tab('match');
  await page.evaluate((id) => { if (window.__mc.state.heroSceneId !== id) window.setHeroScene(id); }, s.id);
  await sleep(3000);
  await shoot('matchday', 'story', `B-shooting-${n}-matchday-story`);
  if (n <= 3) await shoot('matchday', 'post', `B-shooting-${n}-matchday-post`);
  if (n <= 2) await shoot('kickoff', 'story', `B-shooting-${n}-kickoff-story`);
}
await app.close();
await srv.close();
