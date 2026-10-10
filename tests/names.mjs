/* Club names — loi Boss 10.10.
 *
 * For every card that prints club names (each variant, story + post, photo-led
 * AND fallback layouts, home + away) and for the longest and shortest opponent
 * names, renders the poster at full resolution and checks, on the real DOM:
 *   - rule: never "ATLANTIC" alone; the opponent is one of its official forms
 *     and never loses its team numeral (I, II, III, IA…)
 *   - geometry: every name is inside the poster, is not clipped, and overlaps
 *     neither the other name nor a crest, the VS or the score
 * Also checks captions and the control panel labels.
 *
 *   node tests/names.mjs [--engines chromium,webkit] [--verbose]
 */
import { startServer, openApp, PROFILES, ROOT, sleep } from './lib.mjs';

const arg = (name, dflt) => { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : dflt; };
const engines = arg('engines', 'chromium,webkit').split(',');
const verbose = process.argv.includes('--verbose');
const SLUGS = ['cs-la-tour-de-peilz-ii', 'racing-club-lausanne-ii', 'fc-montreux-sports-ii', 'fc-saint-legier-iii',
  'as-fc-napoli-vevey', 'fc-azzurri-90-ls-i', 'fc-slavia-ls', 'fc-leysin', 'pully-football'];
const srv = await startServer(ROOT);
let failures = 0;
const chosen = new Map();

for (const engine of engines) {
  const app = await openApp(engine, srv.url, { profile: PROFILES.ok });
  const { page, errors } = app;
  await page.waitForFunction(() => window.__mc.MATCHES.length > 0 && /-/.test(window.__mc.MATCHES[0].id), null, { timeout: 20000 });
  await page.waitForFunction(() => Object.keys(PHOTO_CACHE).length >= 20 && Object.keys(CREST_CACHE).length >= 12 && document.fonts.check("400 40px 'Portugal2025'"), null, { timeout: 60000 });
  await sleep(500);

  const report = await page.evaluate(async (SLUGS) => {
    const S = window.__mc.state;
    const out = [];
    const stage = document.createElement('div');
    stage.style.cssText = 'position:fixed; left:0; top:0; width:1080px; height:1920px; z-index:-1; opacity:0; pointer-events:none;';
    document.body.appendChild(stage);
    const NUM = /\s((?:I{1,3}|IV|V)[AB]?)$/;
    const backup = { ...S, score: { ...S.score }, goals: [...S.goals], kickoff: { ...S.kickoff } };
    const photoBak = { ...PHOTO_CACHE }, cutBak = { ...CUTOUT_CACHE };
    const scorer = window.__mc.ROSTER.find(p => p._active !== false && p.photoUrl && PHOTO_CACHE[p.photoUrl]);
    const CASES = [
      { variant: 'matchday' }, { variant: 'kickoff' },
      { variant: 'recap', goals: 1 }, { variant: 'recap', goals: 0 },
      { variant: 'live-score' }, { variant: 'halftime' },
      { variant: 'goal', side: 'away' }, { variant: 'goal', side: 'home', scorer: false }, { variant: 'goal', side: 'home', scorer: true },
    ];
    for (const slug of SLUGS) {
      const opp = window.__mc.OPPONENTS.find(o => o.slug === slug);
      if (!opp) { out.push({ id: slug, problems: ['adversaire absent (bundle non chargé ?)'] }); continue; }
      const official = opp.name.toUpperCase();
      const numeral = (opp.name.match(NUM) || [])[1] || '';
      const allowed = clubNames(opp).map(n => n.toUpperCase());
      for (const homeAway of ['home', 'away']) for (const layout of ['photo', 'secours']) for (const c of CASES) for (const format of ['story', 'post']) {
        if (format === 'post' && !['matchday', 'recap'].includes(c.variant)) continue;
        Object.assign(S, { opponentSlug: slug, homeAway, variant: c.variant, format, heroOff: false, heroSceneId: '', customHeroImage: '', sceneId: '',
          score: { home: c.goals ? 12 : 3, away: 10 }, scorerSide: c.side || 'home', scorerId: c.scorer ? scorer.id : '',
          goals: c.goals ? [{ minute: 12, playerId: scorer.id, side: 'home', ts: 1 }] : [], matchBallSponsors: [] });
        /* fallback layouts = no player image in the caches */
        for (const k of Object.keys(PHOTO_CACHE)) delete PHOTO_CACHE[k];
        for (const k of Object.keys(CUTOUT_CACHE)) delete CUTOUT_CACHE[k];
        if (layout === 'photo') { Object.assign(PHOTO_CACHE, photoBak); Object.assign(CUTOUT_CACHE, cutBak); }
        const id = `${slug} · ${homeAway} · ${c.variant}${c.side ? '/' + c.side : ''}${c.scorer ? '/buteur' : ''}${c.goals ? '/1but' : ''} · ${format} · ${layout}`;
        const problems = [];
        let html;
        try { html = posterHTML(); } catch (e) { out.push({ id, problems: ['posterHTML() lève : ' + e.message] }); continue; }
        stage.innerHTML = html;
        const node = stage.querySelector('#poster-node');
        const P = node.getBoundingClientRect();
        const names = [...node.querySelectorAll('[data-club-name]')];
        const texts = names.map(n => n.textContent.trim());
        const rect = (el) => { const r = el.getBoundingClientRect(); return { l: r.left - P.left, t: r.top - P.top, r: r.right - P.left, b: r.bottom - P.top, w: r.width, h: r.height }; };
        /* the INK of a text, not its box: horizontally the range around the
           text node; vertically the glyph extent given by the font metrics (a
           range rect spans the whole ascent+descent of the font, far taller
           than capitals and digits) */
        const mctx = ink.ctx || (ink.ctx = document.createElement('canvas').getContext('2d'));
        function ink(el) {
          const rg = document.createRange(); rg.selectNodeContents(el);
          const r = rg.getBoundingClientRect();
          const cs = getComputedStyle(el);
          mctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
          const m = mctx.measureText(el.textContent.trim());
          const k = r.height / (m.fontBoundingBoxAscent + m.fontBoundingBoxDescent);
          const top = r.top + (m.fontBoundingBoxAscent - m.actualBoundingBoxAscent) * k;
          const bottom = r.top + (m.fontBoundingBoxAscent + m.actualBoundingBoxDescent) * k;
          return { l: r.left - P.left, t: top - P.top, r: r.right - P.left, b: bottom - P.top, w: r.width, h: bottom - top };
        }
        const hit = (a, b, pad = 0) => a.l < b.r - pad && b.l < a.r - pad && a.t < b.b - pad && b.t < a.b - pad;
        /* rule */
        if (/(^|[^C] |[^F]C )ATLANTIC/.test(' ' + node.textContent.replace(/\s+/g, ' '))) problems.push('« ATLANTIC » sans « FC »');
        const atl = texts.filter(t => /ATLANTIC/.test(t));
        const others = texts.filter(t => !/ATLANTIC/.test(t));
        atl.forEach(t => { if (!['FC ATLANTIC VEVEY', 'FC ATLANTIC'].includes(t)) problems.push(`nom FCA inattendu « ${t} »`); });
        others.forEach(t => {
          if (!allowed.includes(t)) problems.push(`nom adverse hors liste « ${t} »`);
          if (numeral && !new RegExp(`\\s${numeral}$`).test(t)) problems.push(`chiffre d'équipe perdu « ${t} » (officiel ${official})`);
        });
        /* geometry */
        const boxes = names.map(ink);
        boxes.forEach((b, i) => {
          if (b.l < 6 || b.r > P.width - 6 || b.t < 0 || b.b > P.height) problems.push(`« ${texts[i]} » sort du poster (x ${Math.round(b.l)}→${Math.round(b.r)} / ${Math.round(P.width)})`);
          const el = names[i];
          if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflow !== 'visible') problems.push(`« ${texts[i]} » rogné`);
          boxes.forEach((o, j) => { if (j > i && hit(b, o, 1)) problems.push(`« ${texts[i]} » chevauche « ${texts[j]} »`); });
        });
        /* the watermark crest (opacity .03) is decor, not a blocker */
        const blockers = [...node.querySelectorAll('[data-vs], [data-score], [data-crest]')].filter(el => parseFloat(getComputedStyle(el).opacity) > 0.5);
        blockers.forEach(el => {
          /* the score digits: their ink, not their fixed-width box */
          const r = el.hasAttribute('data-score') ? ink(el) : rect(el);
          boxes.forEach((b, i) => {
            /* a name may sit right under ITS OWN crest; overlapping any crest/VS/score ink is a defect */
            if (hit(b, r, 2)) problems.push(`« ${texts[i]} » chevauche ${el.hasAttribute('data-vs') ? 'le VS' : el.hasAttribute('data-score') ? 'le score' : 'un écusson'}`);
          });
        });
        out.push({ id, texts, sizes: names.map(n => Math.round(parseFloat(getComputedStyle(n).fontSize))), problems });
      }
    }
    /* captions + interface labels (current fixture) */
    const ui = [];
    for (const v of ['matchday', 'lineup', 'kickoff', 'live-score', 'goal', 'halftime', 'recap']) {
      S.variant = v;
      const cap = captionToString();
      if (/(?<!FC ?)Atlantic/i.test(cap)) ui.push(`caption ${v} : « Atlantic » sans « FC »`);
      for (const sec of sectionsForVariant()) {
        S.activeSection = sec; renderPanel();
        const txt = document.getElementById('panel-content').innerText;
        if (/(?<!FC ?)Atlantic/i.test(txt)) ui.push(`panneau ${v}/${sec} : « Atlantic » sans « FC »`);
      }
    }
    S.variant = 'recap'; S.opponentSlug = 'fc-slavia-ls';
    const recapCap = captionToString();
    if (!/FC ATLANTIC VEVEY \d+ — \d+ FC SLAVIA LS/.test(recapCap)) ui.push('caption recap : ligne de score sans noms officiels → ' + recapCap.split('\n').find(l => /—/.test(l) && /\d/.test(l)));
    /* match list rows: an official form, numeral kept, not clipped */
    S.activeSection = 'match'; renderPanel();
    const rows = [...document.querySelectorAll('.match-row .mr-opp')].map(el => ({ t: el.textContent, names: el.dataset.names.split('|'), clipped: el.scrollWidth > el.clientWidth }));
    rows.forEach(r => {
      if (r.clipped) ui.push(`liste des matchs : « ${r.t} » rogné`);
      const num = (r.names[0].match(NUM) || [])[1];
      if (num && !new RegExp(`\\s${num}$`).test(r.t)) ui.push(`liste des matchs : chiffre perdu « ${r.t} »`);
    });
    stage.remove();
    Object.assign(PHOTO_CACHE, photoBak); Object.assign(CUTOUT_CACHE, cutBak);
    Object.assign(S, backup); renderAll();
    return { out, ui, rows: rows.map(r => r.t) };
  }, SLUGS);

  const bad = report.out.filter(r => r.problems.length);
  failures += bad.length + report.ui.length;
  console.log(`\n[${engine}] ${report.out.length} posters vérifiés · ${bad.length} en défaut · interface/captions : ${report.ui.length} défaut(s) · erreurs JS : ${errors.filter(e => e.kind === 'pageerror').length}`);
  bad.slice(0, 40).forEach(r => console.log(`  ✗ ${r.id}\n      ${r.problems.join('\n      ')}`));
  report.ui.forEach(u => console.log('  ✗ ' + u));
  if (verbose) console.log('  liste des matchs :', [...new Set(report.rows)].join(' · '));
  report.out.forEach(r => { if (r.texts && r.texts.length) { const k = r.id.split(' · ').filter((_, i) => i !== 0 && i !== 1).join(' · '); const key = `${r.id.split(' · ')[0]} | ${k}`; chosen.set(key, `${r.texts.join(' / ')} @${r.sizes.join('/')}px`); } });
  failures += errors.filter(e => e.kind === 'pageerror').length;
  await app.close();
}
await srv.close();
if (verbose) {
  /* one line per (opponent, card): the forms that were retained */
  const by = new Map();
  [...chosen].forEach(([k, v]) => { const [slug, card] = k.split(' | '); if (!by.has(slug)) by.set(slug, new Map()); const m = by.get(slug); if (!m.has(v)) m.set(v, []); m.get(v).push(card); });
  console.log('\nFormes retenues (côté extérieur) :');
  by.forEach((m, slug) => { console.log('  ' + slug); m.forEach((cards, v) => console.log(`     ${v.padEnd(62)} ← ${cards.length} carte(s), ex. ${cards[0]}`)); });
}
console.log(failures ? `\n✗ ${failures} défaut(s)` : '\n✓ noms conformes partout');
process.exit(failures ? 1 : 0);
