/* Final result card (variant `recap`) — geometry test + validation exports.
 *
 *   node tests/recap.mjs                         # geometry: nothing overlaps, in any combination
 *   node tests/recap.mjs --export --tag apres    # → validation-recap-1011/apres-<case>-<format>.png
 *   node tests/recap.mjs --export --tag avant --root /path/to/another/checkout --only win-2-1,loss-0-3
 *
 * Geometry (real DOM, full resolution, chromium + webkit): for 0 to 8 scorer
 * lines × 0 to 3 match-ball sponsors × story/post × home/away × portrait / no
 * visual / full-frame photo × one- and two-digit scores, every block of the
 * card (header, crests, score, club names, scorers, sponsors, venue,
 * signature) stays inside the poster and touches no other block.
 */
import path from 'node:path';
import { startServer, openApp, exportViaTap, PROFILES, ROOT, sleep } from './lib.mjs';

const arg = (name, dflt) => { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : dflt; };
const root = path.resolve(arg('root', ROOT));
const doExport = process.argv.includes('--export');
const engines = arg('engines', doExport ? 'chromium' : 'chromium,webkit').split(',');

/* ---------- validation cases ----------
   goals: [minute, who] — who = index in the scorer pool (a roster player with
   a cut-out portrait), 'x' = FCA goal entered without a scorer, 'opp' = goal
   conceded, 'g1'/'g2' = a guest player (no photo). score is derived. */
const CASES = [
  { key: 'win-2-1',      slug: 'fc-slavia-ls',            ha: 'home', sponsors: 2, goals: [[23, 0], [51, 'opp'], [67, 1]] },
  { key: 'loss-0-3',     slug: 'fc-aigle-ii',             ha: 'away', sponsors: 0, goals: [[12, 'opp'], [40, 'opp'], [77, 'opp']] },
  { key: 'draw-1-1',     slug: 'fc-yvorne-ia',            ha: 'home', sponsors: 1, goals: [[30, 'x'], [58, 'opp']] },
  { key: 'win-5-3',      slug: 'fc-montreux-sports-ii',   ha: 'home', sponsors: 2, goals: [[4, 0], [17, 'opp'], [26, 1], [33, 2], [41, 'opp'], [59, 3], [70, 'opp'], [88, 4]] },
  { key: 'win-8-3',      slug: 'fc-vignoble-ii',          ha: 'home', sponsors: 2, goals: [[4, 0], [11, 1], [17, 'opp'], [26, 2], [33, 3], [41, 'opp'], [52, 4], [59, 5], [70, 'opp'], [81, 6], [88, 7]] },
  { key: 'draw-0-0',     slug: 'fc-leysin',               ha: 'away', sponsors: 0, goals: [] },
  { key: 'win-10-0',     slug: 'fc-turc-lausanne',        ha: 'home', sponsors: 2, goals: [[3, 0], [9, 0], [15, 1], [22, 2], [31, 0], [44, 3], [56, 1], [63, 4], [79, 5], [90, 2]] },
  { key: 'long-racing',  slug: 'racing-club-lausanne-ii', ha: 'home', sponsors: 2, goals: [[9, 2], [19, 2], [35, 'opp'], [72, 5]] },
  { key: 'long-latour',  slug: 'cs-la-tour-de-peilz-ii',  ha: 'away', sponsors: 0, goals: [[28, 'opp'], [61, 3], [84, 6]], message: 'Trois points ramenés de La Tour' },
  { key: 'shooting',     slug: 'fc-slavia-ls',            ha: 'away', sponsors: 0, goals: [[14, 'g1'], [48, 'opp'], [66, 'g2'], [90, 'g1']], shooting: 3 },
  { key: 'sans-visuel',  slug: 'fc-saint-legier-iii',     ha: 'away', sponsors: 0, goals: [[20, 0], [75, 'opp']], heroOff: true },
].filter(c => !arg('only', '') || arg('only', '').split(',').includes(c.key));

const srv = await startServer(root);
let failures = 0;

async function boot(engine) {
  const app = await openApp(engine, srv.url, { profile: PROFILES.ok });
  /* the season bundle must be in (fixture ids are the site's UUIDs), and the portraits too */
  await app.page.waitForFunction(() => window.__mc.MATCHES.length > 0 && /-/.test(window.__mc.MATCHES[0].id), null, { timeout: 20000 });
  await app.page.waitForFunction(() => Object.keys(PHOTO_CACHE).length >= 20 && Object.keys(CREST_CACHE).length >= 12
    && document.fonts.check("400 40px 'Portugal2025'"), null, { timeout: 60000 });
  /* the cut-out portraits of the scorer pool (the app only preloads the ones it is about to show) */
  await app.page.evaluate(() => Promise.all(window.__mc.ROSTER.filter(p => p.cutoutUrl && /^(AT|MIL)/.test(p.position)).map(ensureCutout)));
  return app;
}

/* ---------- validation exports ---------- */
if (doExport) {
  const outDir = path.resolve(arg('out', path.join(ROOT, 'validation-recap-1011')));
  const tag = arg('tag', 'apres');
  const app = await boot(engines[0]);
  const { page } = app;
  const tab = (s) => page.locator(`#section-tabs .tab[data-s="${s}"]`).tap();
  /* the two match-ball sponsors of a home fixture, with their logos */
  const SPONSORS = await page.evaluate(() => {
    const seen = new Map();
    window.__mc.MATCHES.forEach(m => ballSponsorsFor(m.id).forEach(s => seen.set(s.name, s)));
    return [...seen.values()];
  });
  for (const c of CASES) {
    const m = await page.evaluate((c) => {
      const M = window.__mc.MATCHES.find(x => x.opponentSlug === c.slug && x.homeAway === c.ha);
      return M ? { id: M.id, comp: M.comp } : null;
    }, c);
    if (!m) { console.log(`✗ ${c.key}: fixture introuvable`); failures++; continue; }
    await tab('match');
    await page.locator('.match-seg button').nth({ amical: 0, championnat: 1, coupe: 2 }[m.comp]).tap();
    await page.locator(`.match-row[data-mid="${m.id}"]`).tap();
    await sleep(300);
    if (c.shooting !== undefined) {
      await page.evaluate(() => window.toggleShooting());
      await sleep(500);
      const ids = await page.evaluate(() => [...document.querySelectorAll('.hero-mini[onclick^="setHeroScene"]')].map(e => e.getAttribute('onclick').match(/'([^']+)'/)[1]));
      await page.evaluate((id) => { if (window.__mc.state.heroSceneId !== id) window.setHeroScene(id); }, ids[c.shooting % ids.length]);
      await sleep(2500);
    }
    await page.evaluate(({ c, SPONSORS }) => {
      const { state, ROSTER } = window.__mc;
      const pool = ROSTER.filter(p => !p.isGuest && p._active !== false && CUTOUT_CACHE[p.cutoutUrl] && /^(AT|MIL)/.test(p.position));
      const guest = (n, lastName, jersey) => {
        const id = 'guest-recap-' + n;
        if (!BY_ID[id]) { const g = { id, jerseyDisplay: jersey, firstName: 'Invité', lastName, position: 'AT', isGuest: true }; state.guests.push(g); BY_ID[id] = g; }
        return id;
      };
      state.goals = c.goals.map(([minute, who], i) => ({ minute, ts: i + 1,
        side: who === 'opp' ? 'away' : 'home',
        playerId: who === 'opp' || who === 'x' ? '' : who === 'g1' ? guest(1, 'Moreira', '27') : who === 'g2' ? guest(2, 'Bajrami', '33') : String(pool[who].id) }));
      state.score = { home: state.goals.filter(g => g.side === 'home').length, away: state.goals.filter(g => g.side === 'away').length };
      state.minute = 90;
      state.heroOff = !!c.heroOff;
      state.matchBallSponsors = SPONSORS.slice(0, c.sponsors);
      state.customMessage = c.message ? { recap: c.message } : {};
      renderAll();
    }, { c, SPONSORS });
    await tab('variant');
    await page.locator('.variant-card[data-v="recap"]').tap();
    for (const format of ['story', 'post']) {
      await page.locator(`#format-toggle .ft-btn[data-fmt="${format}"]`).tap();
      await sleep(2200);   // crest, cutout and sponsor logos of this fixture land in their caches
      const file = path.join(outDir, `${tag}-${c.key}-${format}.png`);
      const r = await exportViaTap(page, { save: file });
      if (r.status !== 'ok') failures++;
      console.log(`${r.status === 'ok' ? '·' : '✗'} ${path.relative(ROOT, file)} ${r.status} ${r.png ? r.png.w + 'x' + r.png.h : r.message}`);
    }
    await page.evaluate(() => { const s = window.__mc.state; s.heroOff = false; if (s.heroSceneId) window.setHeroScene(s.heroSceneId); });
  }
  await app.close();
  await srv.close();
  process.exit(failures ? 1 : 0);
}

/* ---------- geometry ---------- */
for (const engine of engines) {
  const app = await boot(engine);
  const { page, errors } = app;
  const report = await page.evaluate(async () => {
    const { state: S, ROSTER, MATCHES, OPPONENTS } = window.__mc;
    const backup = JSON.stringify({ ...S, _shootingOpen: false });
    const stage = document.createElement('div');
    stage.style.cssText = 'position:fixed; left:0; top:0; width:1080px; height:1920px; z-index:-1; opacity:0; pointer-events:none;';
    document.body.appendChild(stage);
    /* eight scorers, longest names first (the widest lines), all with a cut-out portrait */
    const pool = ROSTER.filter(p => !p.isGuest && p._active !== false && CUTOUT_CACHE[p.cutoutUrl])
      .sort((a, b) => b.lastName.length - a.lastName.length).slice(0, 8);
    S.captainId = pool[0].id;
    /* eight guest scorers (no portrait): with them the president's full-frame visual is the one shown */
    const guests = ['Pinheiro da Fonseca', 'Vasconcelos Teixeira', 'Krasniqi', 'De Oliveira Santos', 'Müller', 'Ben Abdallah', 'Rodrigues', 'Saint-Exupéry']
      .map((lastName, i) => ({ id: 'guest-geom-' + i, jerseyDisplay: String(60 + i), firstName: 'Invité', lastName, position: 'AT', isGuest: true }));
    guests.forEach(g => { BY_ID[g.id] = g; });
    const sponsors = (() => { const m = new Map(); MATCHES.forEach(x => ballSponsorsFor(x.id).forEach(s => m.set(s.name, s))); return [...m.values()]; })();
    while (sponsors.length < 3) sponsors.push({ name: 'Parrain ' + sponsors.length, abbr: 'P' + sponsors.length });
    await Promise.all(sponsors.map(s => loadAsset(SPONSOR_CACHE, s.logoUrl, s.logoUrl)));
    /* a full-frame visual (imported photo): any opaque image does */
    const c = document.createElement('canvas'); c.width = 54; c.height = 96;
    const cx = c.getContext('2d'); cx.fillStyle = '#7a8fa8'; cx.fillRect(0, 0, 54, 96);
    const BG = c.toDataURL('image/jpeg');
    const mctx = document.createElement('canvas').getContext('2d');
    const out = [];
    let n = 0;
    for (const slug of ['fc-slavia-ls', 'racing-club-lausanne-ii'])
    for (const ha of ['home', 'away'])
    for (const format of ['story', 'post'])
    for (const visual of ['portrait', 'none', 'bg'])
    for (const nSponsors of [0, 1, 2, 3])
    for (const note of ['', 'Merci à tous nos supporters',
      'Soirée raclette du club samedi prochain à la buvette, inscriptions auprès du comité, toutes les familles des juniors',
      'Merci à tous nos supporters présents au bord du terrain malgré la pluie, on se retrouve dimanche prochain à la Veyre pour la réception du leader'])
    for (const nScorers of [0, 1, 2, 3, 4, 5, 6, 7, 8])
    for (const perScorer of nScorers ? [1, 3] : [1]) {
      const M = MATCHES.find(x => x.opponentSlug === slug && x.homeAway === ha);
      applyMatchFields(M);
      const conceded = [0, 3, 12][n % 3];
      const goals = [];
      const scorers = visual === 'bg' ? guests : pool;
      for (let i = 0; i < nScorers; i++) for (let j = 0; j < perScorer; j++) goals.push({ minute: 3 + i * 9 + j * 31, playerId: scorers[i].id, side: 'home', ts: goals.length + 1 });
      if (!nScorers && n % 2) goals.push({ minute: 50, playerId: '', side: 'home', ts: 1 });   // a goal without a scorer
      for (let i = 0; i < conceded; i++) goals.push({ minute: 5 + i * 7, playerId: '', side: 'away', ts: goals.length + 1 });
      /* heroPlayerId: without a scorer the portrait is the president's pick — a player whose cut-out is in */
      Object.assign(S, { variant: 'recap', format, goals, heroOff: visual === 'none', customHeroImage: visual === 'bg' ? BG : '', heroSceneId: '', sceneId: '', heroPlayerId: pool[1].id,
        score: { home: goals.filter(g => g.side === 'home').length, away: conceded },
        matchBallSponsors: sponsors.slice(0, nSponsors), customMessage: { recap: note } });
      n++;
      const id = `${slug} · ${ha} · ${format} · ${visual} · ${nSponsors} parrain(s) · ${nScorers} buteur(s)×${perScorer}${note ? ' · message' : ''} · ${S.score.home}-${S.score.away}`;
      const problems = [];
      let html;
      try { html = posterHTML(); } catch (e) { out.push({ id, problems: ['posterHTML() lève : ' + e.message] }); continue; }
      stage.innerHTML = html;
      const node = stage.querySelector('#poster-node');
      const P = node.getBoundingClientRect();
      const rel = (r) => ({ l: r.left - P.left, t: r.top - P.top, r: r.right - P.left, b: r.bottom - P.top });
      const box = (el) => rel(el.getBoundingClientRect());
      const text = (el) => { const rg = document.createRange(); rg.selectNodeContents(el); return rel(rg.getBoundingClientRect()); };
      /* the INK of a line of capitals or digits (a range rect spans the whole font box) */
      const ink = (el) => {
        const rg = document.createRange(); rg.selectNodeContents(el);
        const r = rg.getBoundingClientRect(), cs = getComputedStyle(el);
        mctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
        const m = mctx.measureText(el.textContent.trim());
        const k = r.height / (m.fontBoundingBoxAscent + m.fontBoundingBoxDescent);
        return rel({ left: r.left, right: r.right, top: r.top + (m.fontBoundingBoxAscent - m.actualBoundingBoxAscent) * k, bottom: r.top + (m.fontBoundingBoxAscent + m.actualBoundingBoxDescent) * k });
      };
      const leaf = (t) => [...node.querySelectorAll('div, span')].find(el => !el.children.length && el.textContent.trim() === t);
      const union = (rs) => ({ l: Math.min(...rs.map(r => r.l)), t: Math.min(...rs.map(r => r.t)), r: Math.max(...rs.map(r => r.r)), b: Math.max(...rs.map(r => r.b)) });
      const blocks = [];
      const add = (name, el, fn = text) => { if (el) blocks.push({ name, ...fn(el) }); else problems.push(`${name} : introuvable`); return el; };

      /* --- content: nothing may be lost --- */
      const win = S.score.home > S.score.away, draw = S.score.home === S.score.away;
      const titre = add('verdict', leaf(win ? 'VICTOIRE' : draw ? 'MATCH NUL' : 'DÉFAITE'));
      if (titre) {
        const col = getComputedStyle(titre).color.replace(/\s/g, '');
        const want = win ? 'rgb(245,184,46)' : draw ? 'rgb(255,255,255)' : 'rgb(248,113,113)';
        if (col !== want) problems.push(`verdict : couleur ${col}, attendu ${want}`);
      }
      add('kicker', leaf('Résultat final · 26/27'));
      add('compétition', leaf(compLine()));
      add('jour', leaf(S.kickoff.dayName));
      add('date', leaf(`${S.kickoff.dateLabel} ${S.kickoff.year}`));
      const crests = [...node.querySelectorAll('[data-crest]')];
      const digits = [...node.querySelectorAll('[data-score]')];
      const names = [...node.querySelectorAll('[data-club-name]')];
      if (crests.length !== 2 || digits.length !== 2 || names.length !== 2) problems.push(`affiche incomplète : ${crests.length} écusson(s), ${digits.length} chiffre(s), ${names.length} nom(s)`);
      else {
        ['écusson gauche', 'écusson droit'].forEach((nm, i) => add(nm, crests[i], box));
        ['score gauche', 'score droit'].forEach((nm, i) => add(nm, digits[i], ink));
        ['nom gauche', 'nom droit'].forEach((nm, i) => add(nm, names[i], ink));
        /* home/away law: the home team and its goals on the left */
        const fcaLeft = /ATLANTIC/.test(names[0].textContent);
        if (fcaLeft !== (ha === 'home')) problems.push('loi domicile/extérieur : le club à domicile n\'est pas à gauche');
        const want = ha === 'home' ? [S.score.home, S.score.away] : [S.score.away, S.score.home];
        if (digits.map(d => d.textContent.trim()).join('-') !== want.join('-')) problems.push(`score affiché ${digits.map(d => d.textContent.trim()).join('-')}, attendu ${want.join('-')}`);
        if (node.querySelector('[data-vs]')) problems.push('un VS subsiste sur la carte résultat');
        /* same crest box both sides, hero scale */
        const [a, b] = crests.map(box);
        if (Math.abs((a.r - a.l) - (b.r - b.l)) > 1 || (a.r - a.l) < 0.27 * P.width) problems.push(`écussons : ${Math.round(a.r - a.l)} / ${Math.round(b.r - b.l)} px`);
        /* the score sits between the crests, clear of both */
        const [dl, dr] = digits.map(ink);
        if (dl.l - a.r < 10 || b.l - dr.r < 10) problems.push(`score trop près d'un écusson (${Math.round(dl.l - a.r)} / ${Math.round(b.l - dr.r)} px)`);
        if (Math.abs((dl.r + dr.l) / 2 - P.width / 2) > 2) problems.push('le tiret du score n\'est pas sur l\'axe de la carte');
        /* the visual that was asked for is the one on the card */
        const portrait = node.querySelector('[style*="opacity:0.74"]'), full = node.querySelector('[style*="background-size:cover"]');
        if (!!portrait !== (visual === 'portrait') || !!full !== (visual === 'bg')) problems.push(`visuel attendu « ${visual} » : portrait ${!!portrait}, plein cadre ${!!full}`);
        if (portrait && nScorers && !portrait.style.backgroundImage.includes(CUTOUT_CACHE[pool[nScorers - 1].cutoutUrl].slice(0, 120))) problems.push('le portrait n\'est pas celui du dernier buteur');
        /* no face behind a crest: the head ends above the crests */
        if (visual === 'portrait') {
          const headBottom = (format === 'post' ? 166 + 400 : 266 + 340) * (format === 'post' ? P.height / 1920 : 1);
          if (a.t < headBottom) problems.push(`le portrait passe derrière les écussons (tête → ${Math.round(headBottom)}, écussons ${Math.round(a.t)})`);
        }
      }
      const rows = [...node.querySelectorAll('[data-buteur]')];
      if (rows.length !== nScorers) problems.push(`${rows.length} ligne(s) de buteur pour ${nScorers} buteur(s)`);
      rows.forEach((el, i) => {
        add(`buteur ${i + 1}`, el);
        const p = scorers[i], t = el.textContent;
        if (!t.includes(p.lastName.toUpperCase())) problems.push(`buteur ${i + 1} : nom absent (« ${t} »)`);
        goals.filter(g => g.playerId === p.id).forEach(g => { if (!t.includes(g.minute + "'")) problems.push(`buteur ${i + 1} : minute ${g.minute}' absente`); });
      });
      if (nScorers) add('label buteurs', leaf(nScorers > 1 ? 'Buteurs' : 'Buteur'));
      if (note) add('message', leaf(note));
      const spLabel = leaf(TENANT_CONFIG.copy.matchBallLabel);
      if (!!spLabel !== nSponsors > 0) problems.push(nSponsors ? 'parrains : bloc absent' : 'parrains : bloc présent sans parrain');
      if (spLabel) {
        const items = [...spLabel.nextElementSibling.children];
        if (items.length !== nSponsors) problems.push(`parrains : ${items.length} affiché(s) pour ${nSponsors}`);
        blocks.push({ name: 'parrains', ...union([text(spLabel), ...items.map(box)]) });
      }
      const pastille = leaf(ha === 'home' ? 'Domicile' : 'Extérieur');
      add('lieu', pastille && pastille.parentElement);
      add('signature', leaf('fc-atlantic-vevey.ch'));
      add('hashtag', [...node.querySelectorAll('div')].find(el => !el.children.length && el.textContent.trim().startsWith('#')));

      /* --- geometry: every block inside the poster, no two blocks touching --- */
      blocks.forEach(b => {
        if (b.l < 24 || b.r > P.width - 24 || b.t < 0 || b.b > P.height) problems.push(`${b.name} sort de la carte (x ${Math.round(b.l)}→${Math.round(b.r)}, y ${Math.round(b.t)}→${Math.round(b.b)})`);
      });
      for (let i = 0; i < blocks.length; i++) for (let j = i + 1; j < blocks.length; j++) {
        const a = blocks[i], b = blocks[j];
        if (a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b) problems.push(`${a.name} chevauche ${b.name}`);
      }
      /* a message that wraps keeps its distance from the scorers label */
      const msg = blocks.find(b => b.name === 'message'), lab = blocks.find(b => b.name === 'label buteurs');
      if (msg && lab && lab.t - msg.b < 14 * P.height / (format === 'post' ? 1350 : 1920)) problems.push(`message à ${Math.round(lab.t - msg.b)} px du label des buteurs`);
      /* scorers never near the foot: air above the sponsors (or the venue line) */
      const foot = blocks.find(b => b.name === 'parrains') || blocks.find(b => b.name === 'lieu');
      const last = blocks.filter(b => /^buteur |^message$|^nom /.test(b.name)).reduce((m, b) => Math.max(m, b.b), 0);
      const air = foot ? foot.t - last : 0;
      if (foot && air < 22 * P.height / 1920 * (format === 'post' ? 1920 / 1350 : 1)) problems.push(`${Math.round(air)} px seulement entre le contenu et le pied`);
      out.push({ id, problems, air: Math.round(air) });
    }
    stage.remove();
    guests.forEach(g => { delete BY_ID[g.id]; });

    /* ---------- the scorer's portrait: one definition for the poster, the preview and the export ---------- */
    const visuel = [];
    const until = async (fn, ms = 6000) => { const t0 = Date.now(); while (!fn() && Date.now() - t0 < ms) await new Promise(r => setTimeout(r, 60)); return !!fn(); };
    const guest = { id: 'guest-geom-x', jerseyDisplay: '77', firstName: 'Invité', lastName: 'Moreira', position: 'AT', isGuest: true };
    BY_ID[guest.id] = guest;
    const [a, b] = pool;
    const set = (goals) => Object.assign(S, { variant: 'recap', format: 'story', heroOff: false, customHeroImage: '', heroSceneId: '', heroPlayerId: '', goals,
      score: { home: goals.filter(g => g.side === 'home').length, away: 0 } });
    const shows = (p) => { const el = document.createElement('div'); el.innerHTML = posterHTML(); const po = el.querySelector('[style*="opacity:0.74"]');
      return !!po && !!CUTOUT_CACHE[p.cutoutUrl] && po.style.backgroundImage.includes(CUTOUT_CACHE[p.cutoutUrl].slice(0, 120)); };
    /* A · a roster player scores, a guest scores last, the cut-out is not in yet (app relaunched): the export fetches it */
    set([{ minute: 10, playerId: a.id, side: 'home', ts: 1 }, { minute: 70, playerId: guest.id, side: 'home', ts: 2 }]);
    delete CUTOUT_CACHE[a.cutoutUrl];
    await Promise.race([Promise.all(cardAssets()), new Promise(r => setTimeout(r, 6000))]);
    if (!shows(a)) visuel.push('A · buteur de l\'effectif puis invité : le portrait du buteur manque après le chargement de la carte');
    /* B · goals entered out of order: the preview asks for the cut-out of the last goal by the clock */
    set([{ minute: 80, playerId: b.id, side: 'home', ts: 1 }, { minute: 20, playerId: a.id, side: 'home', ts: 2 }]);
    delete CUTOUT_CACHE[b.cutoutUrl];
    refresh();
    if (!(await until(() => CUTOUT_CACHE[b.cutoutUrl])) || !shows(b)) visuel.push('B · buts saisis dans le désordre : l\'aperçu ne demande pas le buste du dernier buteur à la minute');
    /* C · a guest is the only scorer and a shooting photo is the visual: the export waits for that photo */
    const scene = SCENES.find(x => x.group === 'shooting');
    if (!scene) visuel.push('C · aucune photo de shooting dans le bundle');
    else {
      set([{ minute: 30, playerId: guest.id, side: 'home', ts: 1 }]);
      S.heroSceneId = scene.id; delete SCENE_CACHE[scene.url];
      await Promise.race([Promise.all(cardAssets()), new Promise(r => setTimeout(r, 6000))]);
      if (!SCENE_CACHE[scene.url] || !posterHTML().includes('background-size:cover')) visuel.push('C · invité seul buteur + photo de shooting : l\'export ne l\'attend pas');
    }
    delete BY_ID[guest.id];
    /* D · the POST toggle left on after a result post must not change the story-only cards */
    set([{ minute: 10, playerId: a.id, side: 'home', ts: 1 }]);
    S.scorerId = a.id; S.scorerSide = 'home';
    for (const v of ['kickoff', 'live-score', 'halftime', 'goal', 'lineup']) {
      S.variant = v; S.format = 'post'; const inPost = posterHTML();
      S.format = 'story';
      if (inPost !== posterHTML()) visuel.push(`D · bouton POST resté actif : la carte ${v} (story seulement) n'est plus composée sur 1080 px`);
    }
    /* E · CSC adverse (Boss 17.10): an FCA goal without a scorer of ours */
    const leafIn = (root, t) => [...root.querySelectorAll('div, span')].find(el => !el.children.length && el.textContent.trim() === t);
    const render = (v) => { S.variant = v; const el = document.createElement('div'); el.innerHTML = posterHTML(); return el; };
    const portraitOf = (el) => el.querySelector('[style*="opacity:0.74"]');
    const csc = (minute, ts) => ({ minute, playerId: 'csc', side: 'home', ts });
    for (const ha of ['home', 'away']) {
      applyMatchFields(MATCHES.find(x => x.opponentSlug === 'fc-slavia-ls' && x.homeAway === ha));
      /* E1 · CSC only: the goal card is the crest poster, the recap lists « CSC » */
      set([csc(30, 1)]); S.scorerId = 'csc'; S.scorerSide = 'home';
      let el = render('goal');
      const t = el.textContent.replace(/\s+/g, ' ');
      if (!leafIn(el, 'BUT !') || !/Contre son camp/i.test(t) || !t.includes("30'")) visuel.push(`E1 ${ha} · carte BUT CSC : titre, « contre son camp » ou minute absent`);
      if (/S[ée]lectionne le buteur/.test(t) || portraitOf(el) || el.querySelector('[style*="background-size:cover"]')) visuel.push(`E1 ${ha} · carte BUT CSC : placeholder ou visage présent`);
      const crestsG = el.querySelectorAll('[data-crest]').length, digitsG = [...el.querySelectorAll('[data-score]')].map(d => d.textContent.trim()).join('-');
      if (crestsG !== 2 || digitsG !== (ha === 'home' ? '1-0' : '0-1') || el.querySelector('[data-vs]')) visuel.push(`E1 ${ha} · carte BUT CSC : ${crestsG} écusson(s), score ${digitsG}`);
      el = render('recap');
      let rows = [...el.querySelectorAll('[data-buteur]')].map(r => r.textContent.replace(/\s+/g, ' ').trim());
      if (rows.length !== 1 || !/30'/.test(rows[0]) || !/CSC/.test(rows[0])) visuel.push(`E1 ${ha} · recap : lignes ${JSON.stringify(rows)}`);
      S.variant = 'goal'; const cap = getCaption();   // defaultCaption() reads state.variant
      if (!/30'/.test(cap.hook) || !/contre son camp/i.test(cap.body)) visuel.push(`E1 ${ha} · caption but : ${JSON.stringify(cap).slice(0, 140)}`);
      S.variant = 'recap';
      if (!/CSC \(30'\)/.test(getCaption().body)) visuel.push(`E1 ${ha} · caption recap sans « CSC (30') »`);
      /* E2 · CSC between two scorers: chronological lines, the portrait is the last REAL scorer */
      set([{ minute: 10, playerId: a.id, side: 'home', ts: 1 }, csc(40, 2), { minute: 70, playerId: b.id, side: 'home', ts: 3 }]);
      el = render('recap');
      rows = [...el.querySelectorAll('[data-buteur]')].map(r => r.textContent.replace(/\s+/g, ' ').trim());
      if (rows.length !== 3 || !rows[0].includes(a.lastName.toUpperCase()) || !/40'.*CSC/.test(rows[1]) || !rows[2].includes(b.lastName.toUpperCase())) visuel.push(`E2 ${ha} · recap : lignes ${JSON.stringify(rows)}`);
      if (!CUTOUT_CACHE[b.cutoutUrl] || !portraitOf(el) || !portraitOf(el).style.backgroundImage.includes(CUTOUT_CACHE[b.cutoutUrl].slice(0, 120))) visuel.push(`E2 ${ha} · recap : le portrait n'est pas celui du dernier vrai buteur`);
      /* E3 · CSC as the last goal: recapScorer skips it, the goal card is the CSC poster */
      set([{ minute: 10, playerId: a.id, side: 'home', ts: 1 }, csc(80, 2)]); S.scorerId = 'csc';
      if (recapScorer() !== a) visuel.push(`E3 ${ha} · recapScorer() ne retombe pas sur le dernier vrai buteur`);
      el = render('goal');
      if (!el.textContent.includes("80'") || portraitOf(el) || /S[ée]lectionne/.test(el.textContent)) visuel.push(`E3 ${ha} · carte BUT : pas la carte CSC à la 80'`);
      /* E4 · removal: the goal card falls back to the last named scorer, the score follows */
      S.minute = 55; window.logOwnGoal();
      if (S.score.home !== 3 || S.scorerId !== 'csc') visuel.push(`E4 ${ha} · logOwnGoal : score ${S.score.home}, scorerId ${S.scorerId}`);
      [...S.goals].filter(g => g.playerId === 'csc').forEach(g => window.removeGoal(g.ts));
      if (S.score.home !== 1 || S.scorerId !== a.id) visuel.push(`E4 ${ha} · retrait des CSC : score ${S.score.home}, scorerId ${S.scorerId}`);
      window.undoGoal();
      if (S.score.home !== 0 || S.scorerId !== a.id && S.scorerId !== '') visuel.push(`E4 ${ha} · annuler : score ${S.score.home}`);
      /* E5 · geometry of the CSC goal card: inside the card, nothing touching, with a long message */
      set([csc(90, 1)]); S.scorerId = 'csc'; S.customMessage = { goal: 'Merci à tous nos supporters présents au bord du terrain malgré la pluie, on se retrouve dimanche prochain' };
      stage.innerHTML = render('goal').innerHTML; document.body.appendChild(stage);
      const node = stage.querySelector('#poster-node'), P = node.getBoundingClientRect();
      const rect = (e) => { const rg = document.createRange(); rg.selectNodeContents(e); const r = rg.getBoundingClientRect(); return { n: e.textContent.trim().slice(0, 18), l: r.left - P.left, t: r.top - P.top, r: r.right - P.left, b: r.bottom - P.top }; };
      const parts = [leafIn(node, 'BUT !'), leafIn(node, 'Contre son camp'), leafIn(node, "90'"), ...node.querySelectorAll('[data-crest], [data-score], [data-club-name]'),
        leafIn(node, S.customMessage.goal), leafIn(node, 'fc-atlantic-vevey.ch')].filter(Boolean);
      if (parts.length < 11) visuel.push(`E5 ${ha} · carte BUT CSC : ${parts.length}/11 blocs trouvés`);
      const R = parts.map(e => e.matches('[data-crest]') ? (({ left, top, right, bottom }) => ({ n: 'écusson', l: left - P.left, t: top - P.top, r: right - P.left, b: bottom - P.top }))(e.getBoundingClientRect()) : rect(e));
      R.forEach(x => { if (x.l < 24 || x.r > P.width - 24 || x.t < 0 || x.b > P.height) visuel.push(`E5 ${ha} · « ${x.n} » sort de la carte`); });
      for (let i = 0; i < R.length; i++) for (let j = i + 1; j < R.length; j++) {
        const p = R[i], q = R[j];
        if (p.l < q.r && q.l < p.r && p.t < q.b && q.t < p.b) visuel.push(`E5 ${ha} · « ${p.n} » chevauche « ${q.n} »`);
      }
      stage.remove(); S.customMessage = {};
    }
    Object.assign(S, JSON.parse(backup)); renderAll();
    return { out, visuel };
  });
  const { out: cards, visuel } = report;
  const bad = cards.filter(r => r.problems.length);
  const jsErrors = errors.filter(e => e.kind === 'pageerror');
  failures += bad.length + jsErrors.length + visuel.length;
  console.log(`[${engine}] ${cards.length} cartes résultat vérifiées · ${bad.length} en défaut · air mini au-dessus du pied ${Math.min(...cards.map(r => r.air))} px · scénarios (portrait du buteur, bouton POST, CSC) : ${visuel.length} défaut(s) · erreurs JS : ${jsErrors.length}`);
  visuel.forEach(v => console.log('  ✗ ' + v));
  bad.slice(0, 30).forEach(r => console.log(`  ✗ ${r.id}\n      ${[...new Set(r.problems)].join('\n      ')}`));
  if (bad.length > 30) {
    const kinds = new Map();
    bad.forEach(r => new Set(r.problems.map(p => p.replace(/[\d.-]+/g, 'N'))).forEach(k => kinds.set(k, (kinds.get(k) || 0) + 1)));
    console.log('  … par type :'); [...kinds].sort((a, b) => b[1] - a[1]).slice(0, 20).forEach(([k, v]) => console.log(`     ${v} × ${k}`));
  }
  jsErrors.slice(0, 5).forEach(e => console.log('  ✗ ' + e.msg));
  await app.close();
}
await srv.close();
console.log(failures ? `\n✗ ${failures} défaut(s)` : '\n✓ carte résultat : tout y est, rien ne se chevauche');
process.exit(failures ? 1 : 0);
