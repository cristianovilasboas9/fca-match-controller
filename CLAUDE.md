# FCA Match Controller — Ops guide pour Boss

PWA single-file qui génère les visuels Instagram (story 1080×1920 + post 1080×1350) pour les matchs de FC Atlantic Vevey : matchday, kickoff, lineup, live-score, goal, halftime, recap, homme du match. Déployé sur GitHub Pages au push sur `main`.

## URLs
- Repo : https://github.com/cristianovilasboas9/fca-match-controller
- Live : https://cristianovilasboas9.github.io/fca-match-controller/
- Source photos joueurs : `https://fc-atlantic-vevey.ch/players/<slug>.webp`
- Source logos clubs : `https://fc-atlantic-vevey.ch/logos/clubs/<slug>.png`

## Stack
- 1 seul fichier `index.html` (~1668 lignes, fonts Oswald/Inter inline en base64, crest Atlantic en SVG inline).
- html2canvas chargé via CDN dans le fichier.
- Photos joueurs + crests adverses fetchés au runtime → caché en dataURL via `fetchAsDataUrl()` (avec fallback proxy `images.weserv.nl` si CORS échoue).
- Pas de build, pas de `npm install`. On édite `index.html`, on push, GitHub Pages serve.

## Mettre à jour pour un nouveau match (6 lignes à patcher)

Toutes dans `index.html`. Le state JS est lignes 296-318.

```js
// HTML statique de fallback (lignes 183-184)
<strong id="match-opp">vs FC <Opponent></strong>
<small id="match-date">Dim DD mois · HH:MM</small>

// State JS (lignes ~300-303)
opponentSlug: '<slug existant dans OPPONENTS>',
homeAway: 'home' | 'away',
venue: '<Stade>',
venueCity: '<VILLE>',
kickoff: { dayName: 'DIMANCHE', dateLabel: 'DD MOIS', year: 2026, time: 'HH:MM' },
```

Si `homeAway: 'home'`, par défaut le venue est "STADE DE LA VEYRE / ST-LÉGIER" (laisser `venue: ''`).

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

## Structure du fichier (offsets approximatifs)

| Lignes | Contenu |
|---|---|
| 13-220 | Fonts base64 + crest Atlantic SVG (NE PAS lire au scan, gros bruit) |
| 243-266 | `ROSTER` — 23 joueurs (id, jerseyDisplay, firstName, lastName, position, photoUrl, isCaptain) |
| 271-282 | `OPPONENTS` — clubs 5e Ligue Groupe 2 (slug, name, shortName, abbr, crestUrl) |
| 284-294 | `VARIANTS` — les 8 types de posters |
| 296-318 | `state` — match data + lineup + UI selection |
| 327-402 | Cache + preload (`PHOTO_CACHE`, `CREST_CACHE`, `preloadAllAssets`) |
| 565-612 | `unifiedScoreRow` — le score commun à liveScore/halftime/recap |
| 614-635 | `venueFooter` — pied de carte avec lieu + pastille DOMICILE/EXTÉRIEUR |
| 700-922 | Fonctions de poster par variant (`matchdayPoster`, `kickoffPoster`, `lineupPoster`, etc.) |
| 944-1110 | `lineupPoster` + bucketing par position + placement sur terrain tactique |
| 1349-1400 | `panelLineup` — UI sélection 11+banc avec compteurs par poste |
| 1421-1500 | `bindPanelEvents` — handlers onClick |
| 1602, 1697 | Init : `preloadAllAssets()` puis `refresh()` |

## Pièges à NE PAS réintroduire

1. **Photos `.webp` pas `.png`** — le site fc-atlantic-vevey.ch a migré tout en webp. Toute URL en `.png` dans ROSTER → 404 → fallback initiales. Toujours utiliser `.webp`.
2. **Badges jersey/capitaine clippés** — pattern actuel : conteneur extérieur `position:relative; width:Xpx; height:Xpx;` + wrapper photo intérieur `position:absolute; inset:0; border-radius:50%; overflow:hidden;` + badges en `position:absolute` SIBLINGS du wrapper photo (pas dedans) avec `z-index:3`. Si tu re-fusionnes en un seul div avec `overflow:hidden`, les badges disparaissent.
3. **Score glow** — `unifiedScoreRow` utilise `getVariant().accent`, pas la constante `ACCENT`. Garder pour cohérence chromatique entre halftime (orange), recap (vert), kickoff (violet).
4. **COUP D'ENVOI** — taille `120px` (pas 150px) sinon overflow horizontal avec `white-space:nowrap` à 1080px de large.
5. **Compteurs par poste** — `panelLineup` parse la formation (4-3-3 → G:1 DEF:4 MIL:3 AT:3) et affiche pastilles vert/orange/rouge. Si la compo ne matche pas la formation, warning visible. Le `lineupPoster` fait du bucketing par `p.position` et place les surplus dans les rangs vides — un défenseur en surplus peut donc finir ailier (warning UI prévient).

## Backlog non bloquant

- Safe zones Insta : story actuelle a 80px de padding interne, Insta demande ~220px haut + 250px bas. `venueFooter` risque d'être masqué par UI Insta sur certains devices.
- Post format = story scalée à 70%, pas un vrai 4:5 retravaillé. Si Boss fait surtout des stories : low priority.
- Surplus par poste : warning UI visible mais le placement final reste imparfait. Pourrait bloquer le clic sur un poste plein au lieu d'avertir.
- Emoji recap (🏆 🤝) rendus via emoji font système → variabilité macOS/iOS/Android. Remplacer par SVG inline pour exports cross-device.

## Si Boss demande un nouveau match (workflow type)

1. Demander : adversaire, date (jour + DD MOIS), heure, home/away, lieu (si extérieur).
2. Vérifier que le slug existe dans `OPPONENTS` (lignes 271-282). Sinon ajouter une entrée (slug + name + shortName + abbr + crestUrl).
3. Vérifier que le logo du club existe : `curl -sI https://fc-atlantic-vevey.ch/logos/clubs/<slug>.png` doit renvoyer 200.
4. Patcher les 6 lignes du state + HTML fallback.
5. Montrer le diff à Boss avant push.
6. Push + verify déploiement live.
7. Demander à Boss de hard-refresh sur son tel (ajouter `?v=N` à l'URL ou suppr/réinstall PWA).

## Commits récents (contexte)
- `83432b1` 8 mai 2026 — fix photos en .webp + wrapper photo aligné
- `ce976e8` 8 mai 2026 — fix badges jersey + capitaine clippés par overflow:hidden
- `2922b33` 8 mai 2026 — match dim 10 mai vs FC Cugy IB + audit formation/visuel
