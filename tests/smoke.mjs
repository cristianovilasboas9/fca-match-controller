/* Smoke: boots the app on both engines (iPhone viewport), exports the default
   card through the real tap path. Also warms the fixture cache.
   Then the CSC path (Boss 17.10): one tap on « CSC adverse » logs an FCA goal
   without a scorer, the goal card exports, the goal survives a relaunch, and
   removing it gives the score and the goal card back. */
import { startServer, openApp, exportViaTap, ROOT, PROFILES } from './lib.mjs';
const root = process.env.MC_ROOT || ROOT;
const srv = await startServer(root);
let failed = 0;

async function cscPath(page) {
  const fails = [];
  const tab = (s) => page.locator(`#section-tabs .tab[data-s="${s}"]`).tap();
  const snap = () => page.evaluate(() => ({ goals: __mc.state.goals.map(g => [g.minute, g.playerId, g.side]), scorerId: __mc.state.scorerId, score: { ...__mc.state.score } }));
  await tab('variant');
  await page.locator('.variant-card[data-v="goal"]').tap();
  await tab('goal');
  await page.locator('#minute-input').fill('37');
  await page.locator('#own-goal-btn').tap();
  const st = await snap();
  if (JSON.stringify(st.goals) !== JSON.stringify([[37, 'csc', 'home']]) || st.scorerId !== 'csc' || st.score.home !== 1) fails.push('tap CSC : ' + JSON.stringify(st));
  const text = await page.evaluate(() => document.querySelector('#poster-root #poster-node').textContent.replace(/\s+/g, ' '));
  if (!/BUT !/.test(text) || !/Contre son camp/i.test(text) || !text.includes("37'")) fails.push('carte BUT CSC incomplète : ' + text.slice(0, 160));
  if (/S[ée]lectionne le buteur/.test(text)) fails.push('carte BUT CSC : placeholder « sélectionne le buteur »');
  const r = await exportViaTap(page);
  if (r.status !== 'ok' || r.png.blank || r.png.partial) fails.push('export carte BUT CSC : ' + JSON.stringify(r));
  /* relaunch: the snapshot brings the CSC back */
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => !!document.querySelector('#poster-root #poster-node'), null, { timeout: 30000 });
  await page.waitForTimeout(1500);
  const st2 = await snap();
  if (JSON.stringify(st2.goals) !== JSON.stringify([[37, 'csc', 'home']]) || st2.scorerId !== 'csc') fails.push('relance : ' + JSON.stringify(st2));
  /* removal from the goal list */
  await tab('goal');
  await page.locator('.goal-row .g-rm').first().tap();
  const st3 = await snap();
  if (st3.goals.length || st3.score.home !== 0 || st3.scorerId !== '') fails.push('retrait : ' + JSON.stringify(st3));
  return { ok: !fails.length, fails, ms: r.ms };
}

for (const engine of (process.env.MC_ENGINES || 'chromium,webkit').split(',')) {
  const app = await openApp(engine, srv.url, { profile: PROFILES.ok });
  await app.page.waitForTimeout(2500);
  const st = await app.page.evaluate(() => ({ matchId: __mc.state.matchId, opp: __mc.state.opponentSlug, variant: __mc.state.variant, build: document.getElementById('build-tag').textContent }));
  const r = await exportViaTap(app.page);
  console.log(engine, JSON.stringify(st), JSON.stringify(r), 'requests:', app.net.log.length, 'errors:', JSON.stringify(app.errors.slice(0, 5)));
  if (r.status !== 'ok' || r.png.blank || r.png.partial) failed++;
  const csc = await cscPath(app.page);
  console.log(engine, 'CSC', csc.ok ? 'ok' : '✗ ' + csc.fails.join(' | '), 'errors:', JSON.stringify(app.errors.filter(e => e.kind === 'pageerror').slice(0, 5)));
  if (!csc.ok || app.errors.some(e => e.kind === 'pageerror')) failed++;
  await app.close();
}
await srv.close();
process.exit(failed ? 1 : 0);
