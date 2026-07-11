# FCA Match Controller — Ops guide pour Boss

PWA single-file qui génère les visuels Instagram (story 1080×1920 + post 1080×1350) pour les matchs de FC Atlantic Vevey : 7 variants — matchday, lineup, kickoff, live-score, goal, halftime, recap (l'onglet Buts vit dans Recap ; « homme du match » et « Preview J-3 » ont été supprimés le 16 mai 2026, commit 7cb5872). Déployé sur GitHub Pages au push sur `main`.

## URLs
- Repo : https://github.com/cristianovilasboas9/fca-match-controller
- Live : https://cristianovilasboas9.github.io/fca-match-controller/
- Source photos joueurs : `https://fc-atlantic-vevey.ch/players/<slug>.webp`
- Source logos clubs : `https://fc-atlantic-vevey.ch/logos/clubs/<slug>.png`

## Stack
- 1 seul fichier `index.html` (~2412 lignes au 2026-07-07, fonts Oswald/Inter inline en base64, crest Atlantic en SVG inline).
- html2canvas chargé via CDN dans le fichier.
- Photos joueurs + crests adverses fetchés au runtime → caché en dataURL via `fetchAsDataUrl()` (avec fallback proxy `images.weserv.nl` si CORS échoue).
- Pas de build, pas de `npm install`. On édite `index.html`, on push, GitHub Pages serve.

## TENANT_CONFIG — white-label (refactor 2026-05-27)

Depuis les commits `f636173`/`d190d26`/`67c0f2a`, toutes les métadonnées club vivent dans un bloc unique `TENANT_CONFIG` (`grep -n "const TENANT_CONFIG" index.html` → ligne ~367, bloc ~343-424) : nom du club (name/nameUpper/nameFull), nickname pour captions, couleurs (`theme.primary`, `theme.gold` — les constantes `ACCENT`/`GOLD` en dérivent), copy, hashtags (`social.*`), CDN photos/crests, et venue par défaut (`venue.defaultHomeName` / `defaultHomeDisplayName` / `defaultHomeCity` / `captionAddress`). Le reste du code lit ces valeurs via `TENANT_CONFIG.*` — pour déployer pour un autre club, on ne patche que ce bloc + le crest SVG.

## Mettre à jour pour un nouveau match (lignes à patcher)

Toutes dans `index.html`. Le state JS est lignes ~506-545 (`grep -n "const state" index.html`).

```js
// HTML statique de fallback (lignes 269-270)
<strong id="match-opp">vs <Opponent></strong>
<small id="match-date">Dim DD mois · HH:MM</small>

// State JS (lignes ~508-524)
homeAway: 'home' | 'away',
opponentSlug: '<slug existant dans OPPONENTS>',
matchNumber: '<n° de match ACVF, ex 138135>',   // affiché sur les posters
venue: TENANT_CONFIG.venue.defaultHomeDisplayName,  // ou '<Stade>' si extérieur
venueCity: TENANT_CONFIG.venue.defaultHomeCity,     // ou '<VILLE>' si extérieur
kickoff: { dayName: 'DIMANCHE', dateLabel: 'DD MOIS', year: 2026, time: 'HH:MM' },
matchBallSponsors: [ { name: '<SPONSOR>', abbr: '<2-3 lettres>' }, ... ],  // ou [] — affichés sur matchday/kickoff/recap
```

Si `homeAway: 'home'`, laisser `venue`/`venueCity` vides ou sur `TENANT_CONFIG.venue.*` → fallback automatique sur « Terrain de La Veyre » / « ST-LÉGIER » (les défauts vivent dans TENANT_CONFIG, plus de « STADE DE LA VEYRE » hardcodé). Ne PAS oublier `matchNumber` et `matchBallSponsors`, sinon le nouveau match part avec le n° ACVF et les sponsors du match précédent.

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

## Structure du fichier (offsets vérifiés au 2026-07-07 — ils rotent, préférer `grep -n "<ancre>" index.html`)

| Lignes | Ancre grep | Contenu |
|---|---|---|
| 13-~260 | — | Fonts base64 + crest Atlantic SVG (NE PAS lire au scan, gros bruit) |
| 269-270 | `match-opp` | HTML statique de fallback (opponent + date) |
| 343-424 | `const TENANT_CONFIG` | Métadonnées tenant (voir section ci-dessus) |
| 425-456 | `const ROSTER` | `ROSTER` — 23 joueurs (id, jerseyDisplay, firstName, lastName, position, photoUrl, isCaptain) |
| 457-469 | `const OPPONENTS` | `OPPONENTS` — clubs 5e Ligue Groupe 2 (slug, name, shortName, abbr, crestUrl) |
| 470-478 | `const VARIANTS` | `VARIANTS` — les 7 types de posters |
| 482-489 | `const FORMATION_ROWS` | Formations supportées : 4-3-3, 4-4-2, 4-2-3-1, 3-5-2, 5-3-2, 3-4-3 |
| 506-545 | `const state` | `state` — match data (incl. matchNumber, matchBallSponsors, guests) + lineup + UI selection |
| 553-660 | `PHOTO_CACHE` | Cache + preload (`PHOTO_CACHE`, `CREST_CACHE`, `preloadAllAssets` — singleton avec retry sur échec) |
| 822 | `function unifiedScoreRow` | Le score commun à liveScore/halftime/recap |
| 875 | `function venueFooter` | Pied de carte avec lieu + pastille DOMICILE/EXTÉRIEUR |
| 896 | `matchBallSponsorsBlock` | Bloc sponsors « Ballon de match » (matchday/kickoff/recap) |
| 987-1420 | `function classicPoster` | Fonctions de poster par variant (`classicPoster`, `kickoffPoster`, `lineupPoster` à 1271, etc.) |
| 1679 | `function panelLineup` | UI sélection 11+banc avec compteurs par poste + joueurs invités |
| 1834 | `function bindPanelEvents` | Handlers onClick |
| 2290-2320 | `buildPosterBlob` | Export PNG (`buildPosterBlob`, `downloadPoster`, chemin share iOS) |
| 2405 | `preloadAllAssets()` | Init : `ensureAtlCrestPng()` + `preloadAllAssets()` puis `refresh()` |

## Pièges à NE PAS réintroduire

1. **Photos `.webp` pas `.png`** — le site fc-atlantic-vevey.ch a migré tout en webp. Toute URL en `.png` dans ROSTER → 404 → fallback initiales. Toujours utiliser `.webp`.
2. **Badges jersey/capitaine clippés** — pattern actuel : conteneur extérieur `position:relative; width:Xpx; height:Xpx;` + wrapper photo intérieur `position:absolute; inset:0; border-radius:50%; overflow:hidden;` + badges en `position:absolute` SIBLINGS du wrapper photo (pas dedans) avec `z-index:3`. Si tu re-fusionnes en un seul div avec `overflow:hidden`, les badges disparaissent.
3. **Score glow** — `unifiedScoreRow` utilise `getVariant().accent`, pas la constante `ACCENT`. Garder pour cohérence chromatique entre halftime (orange), recap (vert), kickoff (violet).
4. **COUP D'ENVOI** — taille `120px` (pas 150px) sinon overflow horizontal avec `white-space:nowrap` à 1080px de large.
5. **Compteurs par poste** — `panelLineup` parse la formation via `FORMATION_ROWS` (6 formations : 4-3-3, 4-4-2, 4-2-3-1, 3-5-2, 5-3-2, 3-4-3 ; ex. 4-3-3 → G:1 DEF:4 MIL:3 AT:3) et affiche pastilles vert/orange/rouge. Si la compo ne matche pas la formation, warning visible. Le `lineupPoster` fait du bucketing par `p.position` et place les surplus dans les rangs vides — un défenseur en surplus peut donc finir ailier (warning UI prévient).

## Backlog non bloquant

- Safe zones Insta : story actuelle a 80px de padding interne, Insta demande ~220px haut + 250px bas. `venueFooter` risque d'être masqué par UI Insta sur certains devices.
- Post format = story scalée à 70%, pas un vrai 4:5 retravaillé. Si Boss fait surtout des stories : low priority.
- Surplus par poste : warning UI visible mais le placement final reste imparfait. Pourrait bloquer le clic sur un poste plein au lieu d'avertir.
- Emoji recap (🏆 🤝) rendus via emoji font système → variabilité macOS/iOS/Android. Remplacer par SVG inline pour exports cross-device.

## Si Boss demande un nouveau match (workflow type)

1. Demander : adversaire, date (jour + DD MOIS), heure, home/away, lieu (si extérieur).
2. Vérifier que le slug existe dans `OPPONENTS` (lignes ~457-469). Sinon ajouter une entrée (slug + name + shortName + abbr + crestUrl).
3. Vérifier que le logo du club existe : `curl -sI https://fc-atlantic-vevey.ch/logos/clubs/<slug>.png` doit renvoyer 200.
4. Patcher le state (opponentSlug, homeAway, matchNumber, venue/venueCity, kickoff, matchBallSponsors) + HTML fallback (269-270).
5. Montrer le diff à Boss avant push.
6. Push + verify déploiement live.
7. Demander à Boss de hard-refresh sur son tel (ajouter `?v=N` à l'URL ou suppr/réinstall PWA).

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
- New match = patch the state block (~506-545: opponentSlug, homeAway, matchNumber, venue/venueCity, kickoff, matchBallSponsors) + HTML fallback (269-270) only; never rewrite surrounding code.
- Respect the 5 "Pièges à NE PAS réintroduire" above (`.webp` not `.png`, badge sibling pattern, `getVariant().accent`, COUP D'ENVOI 120px, per-position counters).
- Player photos `.webp` from `fc-atlantic-vevey.ch/players/`, club crests `.png` from `/logos/clubs/`; both fetched at runtime and cached as dataURL.
