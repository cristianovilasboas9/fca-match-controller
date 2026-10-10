/* Smoke: boots the app on both engines (iPhone viewport), exports the default
   card through the real tap path. Also warms the fixture cache. */
import { startServer, openApp, exportViaTap, ROOT, PROFILES } from './lib.mjs';
const root = process.env.MC_ROOT || ROOT;
const srv = await startServer(root);
let failed = 0;
for (const engine of (process.env.MC_ENGINES || 'chromium,webkit').split(',')) {
  const app = await openApp(engine, srv.url, { profile: PROFILES.ok });
  await app.page.waitForTimeout(2500);
  const st = await app.page.evaluate(() => ({ matchId: __mc.state.matchId, opp: __mc.state.opponentSlug, variant: __mc.state.variant, build: document.getElementById('build-tag').textContent }));
  const r = await exportViaTap(app.page);
  console.log(engine, JSON.stringify(st), JSON.stringify(r), 'requests:', app.net.log.length, 'errors:', JSON.stringify(app.errors.slice(0, 5)));
  if (r.status !== 'ok' || r.png.blank || r.png.partial) failed++;
  await app.close();
}
await srv.close();
process.exit(failed ? 1 : 0);
