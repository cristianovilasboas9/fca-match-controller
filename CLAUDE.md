# FCA Match Controller — Ops guide pour Boss

PWA single-file qui génère les visuels Instagram (story 1080×1920 + post 1080×1350) pour les matchs de FC Atlantic Vevey : 7 variants — matchday, lineup, kickoff, live-score, goal, halftime, recap (l'onglet Buts vit dans Recap ; « homme du match » et « Preview J-3 » ont été supprimés le 16 mai 2026, commit 7cb5872). Déployé sur GitHub Pages au push sur `main`.

## URLs
- Repo : https://github.com/cristianovilasboas9/fca-match-controller
- Live : https://cristianovilasboas9.github.io/fca-match-controller/
- Source photos joueurs : `https://fc-atlantic-vevey.ch/players/<slug>.webp`
- Source logos clubs : `https://fc-atlantic-vevey.ch/logos/clubs/<slug>.png`

## Stack
- 1 seul fichier `index.html` (~2756 lignes au 2026-07-19, fonts Oswald/Inter inline en base64, crest Atlantic en SVG inline).
- html2canvas chargé via CDN dans le fichier.
- Photos joueurs + crests adverses fetchés au runtime → caché en dataURL via `fetchAsDataUrl()` (avec fallback proxy `images.weserv.nl` si CORS échoue).
- Pas de build, pas de `npm install`. On édite `index.html`, on push, GitHub Pages serve.

## TENANT_CONFIG — white-label (refactor 2026-05-27)

Depuis les commits `f636173`/`d190d26`/`67c0f2a`, toutes les métadonnées club vivent dans un bloc unique `TENANT_CONFIG` (`grep -n "const TENANT_CONFIG" index.html` → ligne ~391, bloc ~391-468) : nom du club (name/nameUpper/nameFull), nickname pour captions, couleurs (`theme.primary`, `theme.gold` — les constantes `ACCENT`/`GOLD` en dérivent), copy, hashtags (`social.*`), CDN photos/crests, et venue par défaut (`venue.defaultHomeName` / `defaultHomeDisplayName` / `defaultHomeCity` / `captionAddress`). Le reste du code lit ces valeurs via `TENANT_CONFIG.*` — pour déployer pour un autre club, on ne patche que ce bloc + le crest SVG.

## Mettre à jour pour un nouveau match

**Flux normal (saison 26/27)** : dans la PWA, onglet Match → segmented control **Amical / Championnat / BCV Cup** (`setMatchBrowser`, filtre d'affichage only) + **liste tappable** des fixtures (AM1-AM3, Tour prél. BCV Cup, J1-J22 — chaque ligne : tag, date, adversaire, badge DOM/EXT, heure avec `*` si provisoire). Taper une ligne → `applyMatch(id)` applique TOUS les champs au state (adversaire, home/away, compétition + sous-label — porté par le fixture via `competitionSub`, sinon défaut par compétition —, n° ACVF, lieu, kickoff) et **remet `matchBallSponsors` à `[]`** — un match choisi n'hérite JAMAIS des sponsors du match précédent, Boss les re-saisit via le formulaire « Ballons de match » du même onglet. Les inputs adversaire/date/n° et l'onglet « Lieu » ont DISPARU : dom/ext + lieu viennent du fixture. **Seule l'heure reste éditable** (input Heure). Le pick ET l'édition manuelle de l'heure posent `state._userPickedMatch = true` → un `loadFromSite()` qui résout tard n'écrase plus le choix (il garde quand même la convocation). Au chargement, `init()` auto-sélectionne le **prochain fixture par date réelle** (`nextUpcomingMatch()`) si l'API du site est muette.

**Fallback (match hors calendrier / hand-edit)** : patcher le state dans `index.html` (lignes ~608-652, `grep -n "const state" index.html`).

```js
// HTML statique de fallback (ligne ~292, ancre `match-opp`)
<strong id="match-opp">vs <Opponent></strong>
<small id="match-date">Dim DD mois · HH:MM</small>

// State JS (grep -n "const state" index.html)
homeAway: 'home' | 'away',
competition: 'championnat' | 'coupe' | 'amical',
competitionSub: '',   // ligne sous le kicker — les fixtures MATCHES peuvent porter la leur (cup1 = 'COUPE DES ACTIFS · TOUR PRÉLIMINAIRE') ; défauts : coupe→'COUPE DES ACTIFS', amical→'PRÉ-SAISON', championnat→''
opponentSlug: '<slug existant dans OPPONENTS>',
matchNumber: '<n° de match ACVF, ex 149634>',   // affiché sur les posters ; '' pour un amical
venue: TENANT_CONFIG.venue.defaultHomeDisplayName,  // ou '<Stade>' si extérieur
venueCity: TENANT_CONFIG.venue.defaultHomeCity,     // ou '<VILLE>' si extérieur
kickoff: { dayName: 'DIMANCHE', dateLabel: 'DD MOIS', year: 2026, time: 'HH:MM' },
matchBallSponsors: [ { name: '<SPONSOR>', abbr: '<2-3 lettres>' }, ... ],  // ou [] — affichés sur matchday/kickoff/recap
```

Si `homeAway: 'home'`, laisser `venue`/`venueCity` vides ou sur `TENANT_CONFIG.venue.*` → fallback automatique sur « Terrain de La Veyre » / « ST-LÉGIER » (les défauts vivent dans TENANT_CONFIG, plus de « STADE DE LA VEYRE » hardcodé). En hand-edit, ne PAS oublier `matchNumber` et `matchBallSponsors`, sinon le nouveau match part avec le n° ACVF et les sponsors du match précédent (le picker calendrier, lui, gère les deux).

## Workflow de déploiement

```bash
cd ~/Business/fca-match-controller
# édits...
git --no-pager diff index.html
git add index.html
git commit -m "match: dim DD mois vs <Club> (<home|away>, <venue>, HH:MM)"
git push origin main
# GitHub Pages déploie en ~30-60s. Vérifier :
until curl -sL "https://cristianovilasboas9.github.io/fca-match-controller/?v=$(date +%s)" | grep -q "opponentSlug: '<slug>'"; do sleep 6; done && echo OK
```

## Structure du fichier (offsets vérifiés au 2026-07-19 — ils rotent, préférer `grep -n "<ancre>" index.html`)

| Lignes | Ancre grep | Contenu |
|---|---|---|
| 13-~260 | — | Fonts base64 + crest Atlantic SVG (NE PAS lire au scan, gros bruit ; idem la ligne CREST_ATL_DATAURL ~45KB) |
| 292-293 | `match-opp` | HTML statique de fallback (opponent + date) |
| 391-468 | `const TENANT_CONFIG` | Métadonnées tenant (voir section ci-dessus) — incl. `theme.neon` #38BDF8 (cyan saison 26/27) |
| 470-507 | `const ROSTER` | `ROSTER` — 30 joueurs (id, jerseyDisplay, firstName, lastName, position, photoUrl, isCaptain) |
| 509-538 | `const OPPONENTS` | `OPPONENTS` — clubs 4e ligue Groupe 6 saison 26/27 + adversaires amicaux/coupe (slug, name, shortName, abbr, crestUrl) |
| 540-570 | `const MATCHES` | `MATCHES` — calendrier 26/27 : 26 fixtures (3 amicaux + 1 BCV Cup avec `competitionSub` propre + 22 championnat avec n° ACVF) |
| 572-582 | `const VARIANTS` | `VARIANTS` — les 7 types de posters |
| 584-594 | `const FORMATION_ROWS` | Formations supportées : 4-3-3, 4-4-2, 4-2-3-1, 3-5-2, 5-3-2, 3-4-3 |
| 608-652 | `const state` | `state` — match data (incl. matchId, _userPickedMatch, matchNumber, matchBallSponsors, guests) + lineup + UI selection |
| 661-780 | `PHOTO_CACHE` | Cache + preload (`PHOTO_CACHE`, `CREST_CACHE`, `ensureCrest` à 697 — fetch à la demande des crests dynamiques, `preloadAllAssets` à 745 — singleton avec retry sur échec) |
| 904-948 | `function broadcastHeader` | Broadcast v2 : header commun (kicker famille + compLabel + n° match + seasonPill + eyebrowPill) + `ghostRoundLabel()` (927) + `neonHalo()` (939) |
| 994 | `function unifiedScoreRow` | Le score commun à liveScore/halftime/recap |
| 1047 | `function venueFooter` | Pied de carte avec lieu + pastille DOM/EXT (DOM bleu / EXT rouge, loi club) |
| 1077 | `matchBallSponsorsBlock` | Bloc sponsors « Ballon de match » (matchday/kickoff/recap) |
| 1122 | `function shellWrap` | Coque commune : ring dégradé DOM bleu / EXT rouge (variants à venir), atmosphère, sweep famille, ghost label géant, watermark |
| 1201-1660 | `function classicPoster` | Fonctions de poster par variant (`classicPoster`, `kickoffPoster` à 1277, `lineupPoster` à 1478, etc.) |
| 1749-1780 | `function applyMatchFields` | `applyMatchFields(m)` (tous les champs + sous-label fixture-ou-défaut + reset sponsors), `applyMatch(id)` (garde `_userPickedMatch`), `setMatchBrowser(comp)` (filtre d'affichage only) |
| 1782 | `function panelMatch` | Onglet Match v2 : segmented Amical/Championnat/BCV Cup + liste tappable des fixtures + input Heure (seul champ) + ballons de match |
| 1946 | `function panelLineup` | UI sélection 11+banc avec compteurs par poste + joueurs invités |
| 2101 | `function bindPanelEvents` | Handlers onClick (incl. `.match-row` → `applyMatch`, input Heure → garde `_userPickedMatch`) |
| 2355 | `deriveSponsorAbbr` | Initiales sponsor auto (2 premiers mots → 'TA'/'BF' ; mot unique → 2 lettres) |
| 2558-2640 | `buildPosterBlob` | Export PNG (`buildPosterBlob`, `downloadPoster`, chemin share iOS) |
| — | `loadBundle` | Bundle API 26/27 : saison entière (matchs UUID + heures TBD + convocations par match + parrains ballon + roster) depuis /api/match-controller/bundle, cache localStorage `fca-mc:v1:bundle`, fallback tables hardcodées |
| 2739 | `async function init` | Init : auto-sélection `nextUpcomingMatch()` par date réelle, puis `loadFromSite()` + `ensureAtlCrestPng()` + `preloadAllAssets()` puis `refresh()` |

## Design — LIRE AVANT TOUTE MODIF VISUELLE

**`DESIGN-SYSTEM-2627.md` est la loi.** Identité, typographie du maillot
(Portugal2025 solid = texte, Portugal2025 Outlined = grands chiffres), grille
story 1080×1920, briques `FB.*`, blueprint par variante, lois non négociables.
Aucune variante ne se dessine « à la main » : on assemble des briques `FB`.
Toute nouvelle brique s'ajoute à `FB` ET au document.

## Pièges à NE PAS réintroduire

1. **Photos `.webp` pas `.png`** — le site fc-atlantic-vevey.ch a migré tout en webp. Toute URL en `.png` dans ROSTER → 404 → fallback initiales. Toujours utiliser `.webp`.
2. **Badges jersey/capitaine clippés** — pattern actuel : conteneur extérieur `position:relative; width:Xpx; height:Xpx;` + wrapper photo intérieur `position:absolute; inset:0; border-radius:50%; overflow:hidden;` + badges en `position:absolute` SIBLINGS du wrapper photo (pas dedans) avec `z-index:3`. Si tu re-fusionnes en un seul div avec `overflow:hidden`, les badges disparaissent.
3. **Score glow** — `unifiedScoreRow` utilise `getVariant().accent`, pas la constante `ACCENT`. Garder pour cohérence chromatique entre halftime (orange), recap (vert), kickoff (violet).
4. **COUP D'ENVOI** — taille `108px` (pas 120px ni 150px) : à 150px overflow horizontal avec `white-space:nowrap` à 1080px de large, et à 120px le 'I' final clippait au pixel près (commentaire in-file au-dessus de la ligne `font-size:108px`).
5. **Compteurs par poste** — `panelLineup` parse la formation via `FORMATION_ROWS` (6 formations : 4-3-3, 4-4-2, 4-2-3-1, 3-5-2, 5-3-2, 3-4-3 ; ex. 4-3-3 → G:1 DEF:4 MIL:3 AT:3) et affiche pastilles vert/orange/rouge. Si la compo ne matche pas la formation, warning visible. Le `lineupPoster` fait du bucketing par `p.position` et place les surplus dans les rangs vides — un défenseur en surplus peut donc finir ailier (warning UI prévient).

## Backlog non bloquant

- Safe zones Insta : story actuelle a 80px de padding interne, Insta demande ~220px haut + 250px bas. `venueFooter` risque d'être masqué par UI Insta sur certains devices.
- Post format = story scalée à 70%, pas un vrai 4:5 retravaillé. Si Boss fait surtout des stories : low priority.
- Surplus par poste : warning UI visible mais le placement final reste imparfait. Pourrait bloquer le clic sur un poste plein au lieu d'avertir.
- Emoji recap (🏆 🤝) rendus via emoji font système → variabilité macOS/iOS/Android. Remplacer par SVG inline pour exports cross-device.

## Si Boss demande un nouveau match (workflow type)

1. Si le match est dans le calendrier 26/27 (AM1-AM3, BCV Cup, J1-J22) : **rien à coder** — Boss le tape dans la liste de l'onglet Match, tout s'applique (sponsors remis à zéro, à re-saisir). Éventuellement patcher le state par défaut + HTML fallback (`match-opp`, ~292) pour que la PWA démarre sur ce match.
2. Sinon (match hors calendrier) : demander adversaire, date (jour + DD MOIS), heure, home/away, lieu (si extérieur).
3. Vérifier que le slug existe dans `OPPONENTS` (`grep -n "const OPPONENTS" index.html`). Sinon ajouter une entrée (slug + name + shortName + abbr + crestUrl).
4. Vérifier que le logo du club existe : `curl -sI https://fc-atlantic-vevey.ch/logos/clubs/<slug>.png` doit renvoyer 200.
5. Patcher le state (opponentSlug, homeAway, competition/competitionSub, matchNumber, venue/venueCity, kickoff, matchBallSponsors) + HTML fallback (~292).
6. Montrer le diff à Boss avant push.
7. Push + verify déploiement live.
8. Demander à Boss de hard-refresh sur son tel (ajouter `?v=N` à l'URL ou suppr/réinstall PWA).

## Features saison 26/27 — chantier bundle + persistance + DA (août 2026)
- **Bundle API** (`222a9e1`) — `loadBundle()` remplace loadFromSite : GET https://fc-atlantic-vevey.ch/api/match-controller/bundle (sans `?ts` — le CDN 120s sert des HIT). MATCHES/OPPONENTS/ROSTER projetés du bundle (ids = UUID DB, la DB gagne sur les horaires), convocation PAR match sélectionné avec matching numéro+nom, parrains ballon pré-remplis par match, labels J1-J22 ordinaux (matchday DB vide). Offline : cache localStorage, sinon seed hardcodé.
- **Persistance live** (`222a9e1`) — snapshot par match `fca-mc:v1:live:<matchKey>` (TTL 12h) écrit à chaque mutation + pagehide/visibilitychange ; restauré par init() AVANT l'auto-sélection. Changer de match = reset propre (confirm si buts saisis) ; revenir sur un match entamé = reprise du snapshot. **Source de vérité score = state.goals** : ±/saisie manuelle créent des buts anonymes, le score en dérive toujours.
- **DA 26/27** (`9aeb5f3`) — fond radial du calendrier d'août + auras + streak −10°, Space Grotesk + Bebas Neue inline (Bebas = chiffres/heures/ghost only, accents en Oswald), accent championnat #60A5FA, footbar signature tricolore + URL, heure TBD = `–:–` + ★★★ SVG or + « heure à confirmer » (jamais d'heure inventée), logos parrains blancs sur tuile sombre (SPONSOR_CACHE dataURL only). Exports de validation : `validation-da-2627/` (non commité).
- **Debug/E2E** — `window.__mc = { state, MATCHES, OPPONENTS, ROSTER, buildPosterBlob }` pour piloter les tests Playwright.

## Features saison 26/27 (juillet 2026)
- **Onglet Match v2** — array `MATCHES` (26 fixtures : 3 amicaux + 1 BCV Cup + 22 journées de championnat avec n° ACVF, horaires `timeProvisional` quand l'ACVF n'a pas confirmé ; les fixtures de coupe portent leur `competitionSub`). Segmented Amical/Championnat/BCV Cup + liste tappable ; taper un match → `applyMatch()` applique tout et **reset les sponsors** ; seul l'input Heure reste éditable ; `state._userPickedMatch` (posé par le pick ET par l'édition de l'heure) empêche `loadFromSite()` d'écraser le choix. `init()` auto-sélectionne le prochain fixture par date réelle si l'API du site est muette.
- **ensureCrest()** — fix crest dynamique : fetch à la demande du crest d'un adversaire ajouté après le preload singleton (sinon badge texte abbr au lieu du logo).
- **Broadcast v2 (design system)** — `broadcastHeader()` commun (kicker + sous-label + n° match + seasonPill), accents FAMILLE via `compAccent()` (championnat bleu #2E7BFF / coupe or #F5B82E / amical slate #94A3B8), ring dégradé de carte **DOM bleu / EXT rouge** sur les variants à venir (matchday/kickoff/lineup) — même loi que la pastille DOM/EXT du `venueFooter` et que le site —, `ghostRoundLabel()` géant basse opacité (J5/COUPE/AMICAL), heure « néon » en text-shadow. html2canvas-safe partout : glows = divs radial-gradient + text-shadow, JAMAIS `filter:`.
- **Refresh design néon** — `TENANT_CONFIG.theme.neon` #38BDF8 (cyan 26/27), `neonHalo()` derrière le crest, `seasonPill()` (pastille SAISON 26/27) sur les posters.
- **Roster 30 joueurs** — effectif 26/27 aligné sur la vitrine : arrivées Bajro Malcinovic #15 (DEF) + 8 recrues (Cantatore #99 DEF, Selimi #4 AT, Cerqueira #16 MIL, Das Dores #25 AT, Marzouki #17 MIL id `17-R`, Rahmani #45 AT, Santos Ribeiro #7 AT, Sousa Marques #9 AT) ; David Da Costa Silva #8 repositionné AT → MIL.
- **loadFromSite durci** — n° de match accepté uniquement si numérique (un id API type `amical-…` ne s'imprime jamais), sous-label de compétition remis au défaut cohérent quand l'API n'en fournit pas.

## Features post-mai 2026 (contexte rapide)
- **Joueurs invités** (`1694b8b`) — ajout libre nom + numéro + poste dans `state.guests`, plaçables terrain/banc.
- **Ballons de match** (`31d8b97`) — `state.matchBallSponsors`, bloc affiché sur matchday/kickoff/recap.
- **N° de match ACVF** (`7f58bc6`) — `state.matchNumber`, affiché sur les posters ; + fix share/download iOS.
- **White-label** (`f636173`/`d190d26`/`67c0f2a`) — bloc TENANT_CONFIG (voir section dédiée).
- **Stabilité** (`1623de9`) — échecs toBlob/decode/load remontés, preload singleton avec retry.
- **Roster** (`323d192`) — David Da Costa Silva #99 → #8.

## Commits récents (contexte au 2026-07-07 — pour l'historique complet : `git log --oneline -15`)
- `0cdf378` 6 juin 2026 — match dim 7 juin 15h vs CS La Tour-de-Peilz III (home, Veyre, #138135)
- `31d8b97` 29 mai 2026 — feat(sponsors): ballons de match sur matchday + kickoff + recap
- `67c0f2a` 27 mai 2026 — fix(white-label): plug 4 tenant-leaks + singleton retry preload
- `f636173` 27 mai 2026 — refactor(white-label): extraction du bloc TENANT_CONFIG

## Marketing — Source of Truth
All marketing intelligence and production for this business lives in the marketing hub:
**~/Business/STUDIO_MARKETING_IA** — read its MARKETING-BASE.md before any marketing/content/video task.
- Production: brief-to-render + studio-montage skills (Remotion engine v2)
- Delivery laws: AD-review protocol (contact sheets + per-segment volumedetect + -16 LUFS / -1 dBTP), caption-sync law, asset-truth laws (real screens, real motion)
- Knowledge: STUDIO_MARKETING_IA/knowledge/ incl. marketing-skills-library (34 official marketing skills)
- Campaign state for this business: STUDIO_MARKETING_IA/projects/

## Engineering Contract

> Behavioral principles live in global `~/.claude/CLAUDE.md` §0 (Engineering Precision Protocol). This is the project-specific instantiation: the concrete verify steps and conventions that make §0.4 "Goal-Driven Execution" enforceable here. Verify before claiming done.

### Verify commands (only list what actually exists; else `n/a`)
| Step | Command |
|------|---------|
| Lint/Typecheck | `n/a` — no build system, no `package.json`, vanilla HTML/CSS/JS |
| Test | `n/a` — no test runner; verification is visual (render the 7 posters) |
| Build | `n/a` — `index.html` is served as-is by GitHub Pages |
| Run locally | `open index.html` (or `python3 -m http.server 8000` then `http://localhost:8000`) |
| Deploy | `git add index.html && git commit && git push origin main` → Pages deploys in ~30-60s; verify with the `until curl … grep` loop above |

### Definition of done
The 7 poster variants render correctly in-browser (photos load, badges not clipped, no horizontal overflow at 1080px), the edit is surgical (only the lines that must change), and the deploy + live-verify loop has actually run when a real match was patched.

### Conventions to match (§0.3 Surgical Changes)
- Single-file architecture: everything lives in `index.html` (fonts base64-inline, crest SVG inline, html2canvas via CDN). No new files, no toolchain.
- New match = tap it in the Match tab fixture list when it's a season fixture; hand-edits are the fallback: patch the state block (~608-652: opponentSlug, homeAway, competition/competitionSub, matchNumber, venue/venueCity, kickoff, matchBallSponsors) + HTML fallback (~292) only; never rewrite surrounding code.
- Respect the 5 "Pièges à NE PAS réintroduire" above (`.webp` not `.png`, badge sibling pattern, `getVariant().accent`, COUP D'ENVOI 108px, per-position counters).
- Player photos `.webp` from `fc-atlantic-vevey.ch/players/`, club crests `.png` from `/logos/clubs/`; both fetched at runtime and cached as dataURL.
