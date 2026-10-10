/* Root-cause experiments for "la génération de l'image bug parfois".
 * Each experiment isolates ONE mechanism and prints what it measured.
 *
 *   node tests/rootcause.mjs [--root DIR] [--engines chromium,webkit] [--only E1,E2]
 *
 * E1  the export depends on the thumbnails of the control panel
 * E2  html2canvas (CDN) missing at boot
 * E3  shooting photo chosen as main visual, then the app is restarted
 * E4  guest player placed after an app restart
 * E5  what an expired export leaves behind
 * E6  the CDN of html2canvas does not answer at boot
 * E7  does the on-screen card follow the asset caches? (slow network)
 */
import path from 'node:path';
import { startServer, openApp, exportViaTap, PROFILES, ROOT, OUT_DIR, sleep } from './lib.mjs';

const arg = (name, dflt) => { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : dflt; };
const root = path.resolve(arg('root', ROOT));
const engines = arg('engines', 'chromium,webkit').split(',');
const only = arg('only', 'E1,E2,E3,E4,E5,E6,E7').split(',');
const srv = await startServer(root);
const out = [];
const say = (engine, exp, line) => { const l = `[${engine}] ${exp} · ${line}`; out.push(l); console.log(l); };
const fmt = (r) => r.status === 'ok' ? `OK ${r.ms}ms ${r.png.w}x${r.png.h}${r.png.blank ? ' BLANK' : ''}${r.png.partial ? ' PARTIAL' : ''}` : `${r.status.toUpperCase()} ${r.ms}ms — ${r.message}`;
const tapTab = (page, s) => page.locator(`#section-tabs .tab[data-s="${s}"]`).tap();
const tapVariant = (page, v) => page.locator(`.variant-card[data-v="${v}"]`).tap();
const warm = (page) => page.waitForFunction(() => {
  const s = window.__mc.state, opp = window.__mc.OPPONENTS.find(o => o.slug === s.opponentSlug);
  return opp && !!CREST_CACHE[opp.slug] && Object.keys(PHOTO_CACHE).length >= 20 && Object.keys(CUTOUT_CACHE).length >= 1;
}, null, { timeout: 60000 });
const panelImgs = (page) => page.evaluate(() => document.querySelectorAll('#panel-content img').length);
const cloneReqs = (net, since) => net.log.filter(e => e.t >= since && e.inClone).length;

for (const engine of engines) {
  /* ── E1 ─────────────────────────────────────────────────────────────── */
  if (only.includes('E1')) {
    const app = await openApp(engine, srv.url, { profile: PROFILES.ok });
    const { page, net } = app;
    await warm(page);
    await sleep(800);
    say(engine, 'E1', 'tous les assets du poster sont en cache dataURL (écusson, photos, buste) — réseau sain jusqu\'ici');
    net.profile = PROFILES.imgStall;   // from now on: fetch() fine, <img> requests never answered
    say(engine, 'E1', 'réseau : fetch() OK, mais toute requête <img> reste sans réponse (vignettes du panneau)');

    let t = Date.now();
    let r = await exportViaTap(page);
    say(engine, 'E1', `A. onglet Variant ouvert (${await panelImgs(page)} <img> dans le panneau) → ${fmt(r)} · requêtes émises par le clone html2canvas : ${cloneReqs(net, t)}`);

    await tapTab(page, 'match');
    await sleep(300);
    t = Date.now();
    r = await exportViaTap(page);
    say(engine, 'E1', `B. onglet Match ouvert (${await panelImgs(page)} <img> dans le panneau) → ${fmt(r)} · requêtes émises par le clone html2canvas : ${cloneReqs(net, t)}`);

    t = Date.now();
    r = await exportViaTap(page);
    say(engine, 'E1', `B'. nouvel essai sans rien changer → ${fmt(r)}`);

    /* Boss's workaround: "changer de variant et revenir" */
    await tapTab(page, 'variant');
    await tapVariant(page, 'live-score');
    await tapTab(page, 'variant');
    await tapVariant(page, 'matchday');
    await sleep(300);
    t = Date.now();
    r = await exportViaTap(page);
    const sec = await page.evaluate(() => window.__mc.state.activeSection);
    say(engine, 'E1', `C. « changer de variant et revenir » (onglet actif = ${sec}, ${await panelImgs(page)} <img>) → ${fmt(r)} · requêtes du clone : ${cloneReqs(net, t)}`);

    const leaked = await page.evaluate(() => [...document.body.children].filter(el => el.querySelector && el.querySelector('#poster-node') && !el.classList.contains('container')).length);
    say(engine, 'E5', `posters hors-écran restés dans le DOM après ces essais : ${leaked}`);
    await app.close();
  }

  /* ── E2 ─────────────────────────────────────────────────────────────── */
  if (only.includes('E2')) {
    const blockLib = (info) => info.kind === 'lib' ? { type: 'abort' } : { type: 'ok' };
    const app = await openApp(engine, srv.url, { profile: blockLib });
    const { page, net } = app;
    await warm(page);
    const has = await page.evaluate(() => typeof html2canvas);
    say(engine, 'E2', `la librairie de capture n'a pas pu se charger au démarrage (typeof html2canvas = ${has})`);
    let r = await exportViaTap(page);
    say(engine, 'E2', `export → ${fmt(r)}`);
    net.profile = PROFILES.ok;          // the network is back
    r = await exportViaTap(page);
    say(engine, 'E2', `réseau revenu, nouvel essai SANS relancer l'app → ${fmt(r)}`);
    /* the failure drawer and its retry button (fixed build only) */
    net.profile = blockLib;
    await page.evaluate(() => { delete window.html2canvas; });
    await page.locator('#preview-tap').tap({ position: { x: 60, y: 60 } });
    const shown = await page.waitForSelector('#poster-overlay [data-export-error]', { timeout: 30000 }).then(() => true, () => false);
    if (shown) {
      const hint = await page.evaluate(() => document.getElementById('overlay-hint').textContent + ' — ' + document.querySelector('[data-export-error]').textContent);
      await page.screenshot({ path: path.join(OUT_DIR, `export-failure-${engine}.png`) });
      net.profile = PROFILES.ok;
      await page.locator('#overlay-retry').tap();
      const ok = await page.waitForFunction(() => { const im = document.querySelector('#poster-overlay #overlay-body img'); return im && im.complete && im.naturalWidth > 0; }, null, { timeout: 30000 }).then(() => true, () => false);
      say(engine, 'E2', `tiroir d'erreur affiché (« ${hint} ») → bouton Réessayer → ${ok ? 'carte générée' : 'ÉCHEC'}`);
    } else {
      say(engine, 'E2', 'aucun tiroir d\'erreur (le tiroir se referme sur un toast de 1,8 s)');
    }
    await app.close();
  }

  /* ── E3 ─────────────────────────────────────────────────────────────── */
  if (only.includes('E3')) {
    const app = await openApp(engine, srv.url, { profile: PROFILES.ok });
    const { page } = app;
    await warm(page);
    await tapTab(page, 'match');
    await page.locator('[onclick="toggleShooting()"]').tap();
    await page.locator('[onclick^="setHeroScene("]').nth(2).tap();
    await page.waitForFunction(() => { const s = window.__mc.state; const sc = SCENES.find(x => x.id === s.heroSceneId); return sc && !!SCENE_CACHE[sc.url]; }, null, { timeout: 15000 });
    const layout = () => page.evaluate(() => {
      const s = window.__mc.state;
      const sc = SCENES.find(x => x.id === s.heroSceneId);
      const html = document.getElementById('poster-root').innerHTML;
      return { heroSceneId: s.heroSceneId, sceneCached: !!(sc && SCENE_CACHE[sc.url]),
        photoOnCard: !!(sc && SCENE_CACHE[sc.url] && html.includes(SCENE_CACHE[sc.url].slice(0, 120))),
        legacyCard: html.includes('border-radius:32px') };
    });
    say(engine, 'E3', `photo de shooting choisie comme visuel → ${JSON.stringify(await layout())}`);
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => !!document.querySelector('#poster-root #poster-node'));
    await sleep(6000);
    say(engine, 'E3', `app relancée, 6 s plus tard → ${JSON.stringify(await layout())}`);
    const r = await exportViaTap(page);
    say(engine, 'E3', `export après relance → ${fmt(r)} · ${JSON.stringify(await layout())}`);
    await app.close();
  }

  /* ── E4 ─────────────────────────────────────────────────────────────── */
  if (only.includes('E4')) {
    const app = await openApp(engine, srv.url, { profile: PROFILES.ok });
    const { page, errors } = app;
    await warm(page);
    await tapTab(page, 'variant');
    await tapVariant(page, 'lineup');
    await page.locator('#guest-last').fill('Dupont');
    await page.locator('#guest-jersey').fill('77');
    await page.locator('.guest-add-btn').tap();
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => !!document.querySelector('#poster-root #poster-node'));
    await sleep(1500);
    await tapTab(page, 'lineup');
    const n0 = errors.length;
    await page.locator('#pitch-board .pitch-slot.empty').first().tap();
    await page.waitForSelector('#player-sheet.show');
    await sleep(400);
    await page.locator('#sheet-grid .player-mini.is-guest').first().tap();
    await sleep(500);
    const after = await page.evaluate(() => ({
      placed: window.__mc.state.lineupStarters.filter(Boolean),
      sheetStillOpen: document.getElementById('player-sheet').classList.contains('show'),
      onPoster: document.getElementById('poster-root').textContent.toUpperCase().includes('DUPONT'),
    }));
    say(engine, 'E4', `invité ajouté → app relancée → invité posé sur le terrain : ${JSON.stringify(after)} · erreurs JS : ${JSON.stringify(errors.slice(n0).map(e => e.msg))}`);
    await app.close();
  }

  /* ── E6 ─────────────────────────────────────────────────────────────── */
  if (only.includes('E6')) {
    const stallLib = (info) => info.kind === 'lib' ? { type: 'stall' } : { type: 'ok' };
    const app = await openApp(engine, srv.url, { profile: stallLib, waitBoot: false });
    const { page } = app;
    const t0 = Date.now();
    const booted = await page.waitForFunction(() => !!document.querySelector('#poster-root #poster-node'), null, { timeout: 15000 }).then(() => true, () => false);
    say(engine, 'E6', booted ? `le CDN de html2canvas ne répond pas : l'app démarre quand même en ${Date.now() - t0} ms`
                             : `le CDN de html2canvas ne répond pas : l'app n'a toujours PAS démarré après ${Math.round((Date.now() - t0) / 1000)} s (écran « Chargement… »)`);
    if (booted) {
      const r = await exportViaTap(page);
      say(engine, 'E6', `export pendant que le CDN ne répond pas → ${fmt(r)}`);
    }
    await app.close();
  }

  /* ── E7 ─────────────────────────────────────────────────────────────── */
  if (only.includes('E7')) {
    const app = await openApp(engine, srv.url, { profile: PROFILES.ok });
    const { page, net } = app;
    await warm(page);
    await tapTab(page, 'variant');
    await tapVariant(page, 'lineup');
    await page.evaluate(() => { const s = window.__mc.state; s.lineupStarters = window.__mc.ROSTER.filter(p => p._active !== false && p.photoUrl).slice(0, 11).map(p => p.id); });
    await tapTab(page, 'variant');           // real tap → renderAll() → snapshot persisted
    net.profile = PROFILES.slow;
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => !!document.querySelector('#poster-root #poster-node'));
    const t0 = Date.now();
    let tCache = null, tScreen = null;
    while (Date.now() - t0 < 60000 && tScreen === null) {
      const s = await page.evaluate(() => {
        const st = window.__mc.state;
        const cached = st.lineupStarters.filter(id => { const p = window.__mc.ROSTER.find(x => x.id === id); return p && PHOTO_CACHE[p.photoUrl]; }).length;
        const shown = document.querySelectorAll('#poster-root div[style*="width:110px; height:110px; background-image"]').length;
        return { cached, shown };
      });
      if (tCache === null && s.cached === 11) tCache = Date.now() - t0;
      if (s.shown === 11) tScreen = Date.now() - t0;
      await sleep(100);
    }
    say(engine, 'E7', `réseau lent, carte Compo : les 11 photos sont en cache à ${tCache} ms, l'aperçu les montre toutes à ${tScreen} ms → retard de l'aperçu ${tScreen - tCache} ms`);
    await app.close();
  }
}
await srv.close();
console.log('\n' + out.join('\n'));
