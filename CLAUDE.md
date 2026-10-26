# FCA Match Controller — Ops guide pour Boss

PWA single-file qui génère les visuels Instagram (story 1080×1920 + post 1080×1350) pour les matchs de FC Atlantic Vevey : 7 variants — matchday, lineup, kickoff, live-score, goal, halftime, recap (l'onglet Buts vit dans Recap ; « homme du match » et « Preview J-3 » ont été supprimés le 16 mai 2026, commit 7cb5872). Déployé sur GitHub Pages au push sur `main`.

## URLs
- Repo : https://github.com/cristianovilasboas9/fca-match-controller
- Live : https://cristianovilasboas9.github.io/fca-match-controller/
- Source photos joueurs : `https://fc-atlantic-vevey.ch/players/<slug>.webp`
- Source logos clubs : `https://fc-atlantic-vevey.ch/logos/clubs/<slug>.png`

## Stack
- 1 seul fichier `index.html` (~2756 lignes au 2026-07-19, fonts Oswald/Inter inline en base64, crest Atlantic en SVG inline).
- html2canvas chargé via CDN dans le fichier (`<script async>` + `ensureHtml2canvas()` qui le recharge à l'export s'il manque — 3 CDN, même fichier, vérifié par SRI).
- `tests/` : banc Playwright (voir « Engineering Contract »). Aucune dépendance à installer : Playwright est emprunté au repo du site.
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
| — | `function clubNames` | Noms de clubs (loi 10.10) : `clubNames()` (candidats), `unitWidth()` (mesure dans la fonte embarquée), `fitName()` / `fitDuel()` (posters), `fitUiNames()` (interface) |
| — | `function loadAsset` | LA primitive de chargement d'asset (url → dataURL en cache, une requête en vol par asset, aperçu redessiné à l'arrivée) ; `ensureCrest/ensureCutout/ensurePhoto/ensureScene/ensureSponsorLogos` n'en sont que des alias |
| — | `function cardAssets` | Les images que la carte EN COURS affiche — ce que l'export attend (6 s max), et rien d'autre |
| 904-948 | `function broadcastHeader` | Broadcast v2 : header commun (kicker famille + compLabel + n° match + seasonPill + eyebrowPill) + `ghostRoundLabel()` (927) + `neonHalo()` (939) |
| 994 | `function unifiedScoreRow` | Le score des cartes de secours (sans photo) : liveScore / halftime / goal |
| 1047 | `function venueFooter` | Pied de carte avec lieu + pastille DOM/EXT (DOM bleu / EXT rouge, loi club) |
| 1122 | `function shellWrap` | Coque commune : ring dégradé DOM bleu / EXT rouge (variants à venir), atmosphère, sweep famille, ghost label géant, watermark |
| — | `duel(top, size` | `FB.duel` : l'AFFICHE (écussons héros + noms officiels + VS, ou le SCORE à la place du VS sur la carte résultat), `FB.buteurs` (buteurs sous l'affiche), `FB.atmosphere` (le visuel en atmosphère), `FB.note` |
| — | `function affichePoster` | Layout unique des cartes d'affiche ; `classicPoster()` (matchday), `kickoffPoster()` et `recapPoster()` (résultat) ne font que lui passer leurs textes |
| 1201-1660 | `function liveScorePoster` | Fonctions de poster des autres variants (`liveScorePoster`, `goalPoster`, `halftimePoster`, `lineupPoster`) |
| 1749-1780 | `function applyMatchFields` | `applyMatchFields(m)` (tous les champs + sous-label fixture-ou-défaut + reset sponsors), `applyMatch(id)` (garde `_userPickedMatch`), `setMatchBrowser(comp)` (filtre d'affichage only) |
| 1782 | `function panelMatch` | Onglet Match v2 : segmented Amical/Championnat/BCV Cup + liste tappable des fixtures + input Heure (seul champ) + ballons de match |
| 1946 | `function panelLineup` | UI sélection 11+banc avec compteurs par poste + joueurs invités |
| 2101 | `function bindPanelEvents` | Handlers onClick (incl. `.match-row` → `applyMatch`, input Heure → garde `_userPickedMatch`) |
| 2355 | `deriveSponsorAbbr` | Initiales sponsor auto (2 premiers mots → 'TA'/'BF' ; mot unique → 2 lettres) |
| 2558-2640 | `buildPosterBlob` | Export PNG : `renderFullRes` (capture html2canvas du SEUL poster hors-écran), `buildPosterBlob`, tiroir d'export (`openExportOverlay` / `fillExportOverlay` / `failExportOverlay`) |
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
3. **Score glow** — `unifiedScoreRow` (cartes de secours live / mi-temps / but) utilise `getVariant().accent`, pas la constante `ACCENT`. Garder pour la cohérence chromatique entre variants.
4. **COUP D'ENVOI** — depuis le 10.10 le titre tient sur DEUX lignes (« COUP / D'ENVOI », 92px) à gauche du portrait ; sur une ligne il passait sous le visage. Historique : à 150px il débordait, à 120px le 'I' final clippait.
5. **Jamais de `window.open()` / `navigator.share()` après un await** — iOS expire le geste utilisateur pendant le rendu html2canvas (plusieurs secondes dès qu'une photo est sur la carte) → popup/partage bloqués EN SILENCE. Tout export passe par l'overlay in-app (`openExportOverlay`/`fillExportOverlay`) : appui long → Photos, bouton Partager = tap frais. Le tap sur la CARTE (`#preview-tap`) est le seul déclencheur (les boutons PNG/SHARE ont été supprimés le 15.08).
6. **Tout fetch d'asset a un timeout** — `fetchAsDataUrl` porte un AbortController 10 s par tentative. Sans ça, un réseau de stade qui flanche gèle l'export pour toujours (spinner infini, verrou `_exporting` bloqué — bug du 15.08). `exportFromCard` a en plus un watchdog 45 s, et fermer le tiroir relâche le verrou (jeton `_exportSeq` posé APRÈS `openExportOverlay()` qui bumpe le jeton en fermant l'ancien tiroir).
7. **BUILD_TAG dans l'appbar** (`v2026-10-26 · photos`) — à BUMPER à chaque déploiement. Les PWA iOS servent des snapshots HTML périmés ; le tampon est le seul moyen de savoir ce que le téléphone exécute. Symptôme classique : « ça ne marche pas » alors que WebKit headless passe → vieille version en cache, tuer/réinstaller la PWA.
8. **html2canvas ne clone QUE le poster** (`ignoreElements` dans `renderFullRes`) — bug du 10.10, « ça bug, il faut changer de variant et revenir ». html2canvas clone le DOCUMENT ENTIER dans une iframe et attend, sans timeout, que toutes les `<img>` du clone aient chargé. Le clone embarquait le panneau de réglages : avec l'onglet Match, Compo ou Buts ouvert, des dizaines de vignettes distantes étaient re-demandées à CHAQUE export ; une seule sans réponse sur le réseau du stade et la capture ne finissait jamais (« Rendu trop long », pareil au 2e essai). L'onglet Variant n'a aucune image → d'où le contournement. Ne JAMAIS retirer `ignoreElements`, ne jamais mettre d'URL distante dans le poster.
9. **L'aperçu suit les caches** — tout chargement d'asset passe par `loadAsset()`, qui redessine l'aperçu à l'arrivée (`scheduleRefresh`). Un cache rempli « à la main » sans redessiner = aperçu périmé jusqu'au prochain changement de variant.
10. **Jamais d'attente sans borne** — `document.fonts.ready` reste en attente sur WebKit/iOS tant que la page n'a pas fini de charger toutes ses ressources (un CDN qui traîne suffisait à geler le démarrage sur « Chargement… » et l'export). Toute promesse du navigateur se met en course avec `waitMs()`.
11. **Noms de clubs** — jamais `shortName`, `abbr` ou un littéral dans un poster : `clubNames()` + `fitName()`/`fitDuel()`. « ATLANTIC » seul est interdit, le chiffre d'équipe (II, III, IA…) ne se perd jamais. Détail : DESIGN-SYSTEM-2627.md §5quater.
12. **Carte résultat** — le score se pose avec `FB.duel(top, size, score)` et les buteurs avec `FB.buteurs()`, jamais à la main : c'est `affichePoster` qui centre l'ensemble et resserre les buteurs quand la place manque (avant le 10.10 ils écrivaient sur les parrains). On ne liste que NOS buteurs : jamais deux colonnes alignées sous les deux écussons. Toute retouche se valide par `node tests/recap.mjs`. Détail : DESIGN-SYSTEM-2627.md §3ter.
13. **Compteurs par poste** — `panelLineup` parse la formation via `FORMATION_ROWS` (6 formations : 4-3-3, 4-4-2, 4-2-3-1, 3-5-2, 5-3-2, 3-4-3 ; ex. 4-3-3 → G:1 DEF:4 MIL:3 AT:3) et affiche pastilles vert/orange/rouge. Si la compo ne matche pas la formation, warning visible. Le `lineupPoster` fait du bucketing par `p.position` et place les surplus dans les rangs vides — un défenseur en surplus peut donc finir ailier (warning UI prévient).

## Backlog non bloquant

- Safe zones Insta : story actuelle a 80px de padding interne, Insta demande ~220px haut + 250px bas. `venueFooter` risque d'être masqué par UI Insta sur certains devices.
- Post format = story scalée à 70%, pas un vrai 4:5 retravaillé. Si Boss fait surtout des stories : low priority.
- Surplus par poste : warning UI visible mais le placement final reste imparfait. Pourrait bloquer le clic sur un poste plein au lieu d'avertir.
- ~~Emoji recap~~ : réglé le 15.08 — tous les emojis des posters sont des SVG inline (posterIcon/trophyIcon/ballIcon/flameIcon).

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

## Chantier du 10.10.2026 — export fiable, noms officiels, affiche
- **Export** — cause racine et correctifs : piège n°8 ci-dessus. En plus : l'export n'attend plus que les images de SA carte (`cardAssets`, 6 s max) au lieu du préchargement des ~45 assets du roster ; la photo de shooting choisie comme visuel est re-téléchargée après une relance ; html2canvas se recharge à la demande ; les invités sont ré-indexés à la reprise d'un snapshot ; un export raté garde le tiroir ouvert avec la raison et un bouton « Réessayer ».
- **Noms** — piège n°11. `OPPONENTS[].mediumName` / `shortName` sont des replis curés conformes à la loi ; un adversaire venu du bundle prend le nom court du site en repli.
- **Affiche** — matchday (story + post) et coup d'envoi : les écussons sont le héros (DESIGN-SYSTEM-2627.md §3bis). Le post 4:5 a enfin sa propre mise en page (plus de zones mortes story). Le recap gardait l'affiche en rappel compact (refait le 11.10, section suivante) ; son pied était calculé sur d'anciennes cotes et les buteurs écrivaient sur les parrains — corrigé.

## Chantier du 11.10.2026 — carte résultat
- **Décision Boss** — « Seulement le résultat final » passe en « logos au centre », comme l'annonce du match validée la veille. En direct, mi-temps et but gardent le visage du joueur en héros : non touchés (exports identiques au pixel près, vérifié).
- **Le recap = l'affiche avec le score à la place du VS** (story + post) : `recapPoster()` passe par `affichePoster()`. Écussons héros sur leur halo, noms officiels dessous, score final en chiffres du maillot entre les deux (domicile à gauche), verdict en titre du header, date du match à la place de l'heure, dernier buteur en portrait d'atmosphère, buteurs sous l'affiche, puis le pied standard (parrains, lieu, signature). Détail et cotes : DESIGN-SYSTEM-2627.md §3ter.
- **Arrangement** — deux pistes rendues et comparées (`validation-recap-1011/_essai-A-vs-B.jpg`) : score entre les écussons (retenu) ou en ligne sous les noms (écarté : écussons plus petits, score détaché, plus de place pour les buteurs).
- **Plus de carte de secours** pour le recap : l'affiche tient sans photo. `matchBallSponsorsBlock()` et `handshakeIcon` ne servaient qu'à elle, supprimés. Le message personnalisé du recap s'affiche maintenant en ligne micro sous les noms (il n'apparaissait pas sur la carte photo).
- **Le visuel** — loi inchangée : s'il y a un buteur FCA, c'est lui qu'on voit, même si une photo de shooting est choisie dans l'onglet Match (loi de la carte BUT) ; « aucun visage » prime sur tout. Seuls NOS buteurs sont listés. Ce qui change : « le buteur » a UNE définition, `recapScorer()` (dernier but FCA à la minute d'un joueur qui a un buste détouré), partagée par le poster, `refresh()` et `cardAssets()`. Avant, trois définitions divergeaient : un invité buteur ou un but saisi dans le désordre laissait la carte sans visuel, et l'export n'attendait pas la photo de shooting quand un invité était le dernier buteur.
- **Revue indépendante** (design + code, contextes neufs) — corrigé dans la foulée : le kicker « Résultat final · Saison 26/27 » coiffait le portrait → « Résultat final · 26/27 » ; plaque nuit sous le score (lisible sur une photo de shooting) ; paires de buteurs adossées à l'axe ; label BUTEURS au corps du label des parrains ; liseré sombre d'1px en travers des posts exportés depuis Chromium (bord haut de la nuit de `FB.atmosphere` sur un demi-pixel — il existait aussi sur le post d'annonce, corrigé pour les deux : les cartes d'annonce sont inchangées à ±1/255 près, hors ce liseré).
- **Bouton POST resté actif** (bug antérieur au chantier, trouvé par la revue de code) — `posterHTML()` posait la largeur de composition `FB.vw` à 1536 dès que le format valait « post », même pour une variante qui n'existe qu'en story. Après un matchday ou un résultat exporté en POST, le coup d'envoi, le direct et la mi-temps sortaient avec le visage décalé à droite (derrière l'heure sur le coup d'envoi). Corrigé : `canPost(v)`. Scénario D de `tests/recap.mjs`.
- **Banc** — `node tests/recap.mjs` vérifie ~6 500 combinaisons par moteur (0 à 8 buteurs × 0 à 3 parrains × story/post × domicile/extérieur × portrait / aucun visuel / photo plein cadre × message absent, court, long × scores à un et deux chiffres) : tout y est, rien ne se touche, le visuel rendu est le bon ; plus trois scénarios sur le portrait du buteur (invité dernier buteur, buts saisis dans le désordre, shooting attendu par l'export). `--export` sort les images de validation dans `validation-recap-1011/` (non commité).

## Chantier du 17.10.2026 — but contre son camp (CSC)
- **Demande Boss** — « quand l'équipe adverse marque contre son camp, on ne peut pas annoncer le but du FCA sans cliquer un joueur ». Onglet Buts : bouton or **« ⚽ CSC adverse à la N' »** au-dessus de la grille des buteurs (`logOwnGoal()`).
- **Modèle** — un CSC est un but FCA ordinaire dans `state.goals` (`side:'home'`) avec le playerId réservé `OWN_GOAL_ID = 'csc'` (`isOwnGoal(g)`) : il compte au score via `syncScoreFromGoals()`, se corrige dans la liste (option « CSC · CONTRE SON CAMP » du sélecteur de buteur, dans les deux sens) et se retire (×, annuler, −) comme les autres ; il est persisté avec le snapshot. Ce n'est jamais un joueur : `BY_ID['csc']` n'existe pas, donc `recapScorer()` le saute (le portrait reste celui du dernier VRAI buteur) et aucun visage n'est demandé.
- **Cartes** — carte BUT : `state.scorerId === 'csc'` → l'AFFICHE (`affichePoster`, nouvelle option `sponsors:false`) avec le score à la place du VS, « BUT ! » or, « Contre son camp » en sous-titre, la minute du but à droite ; jamais la carte « sélectionne le buteur ». Retiré, le CSC rend la carte BUT au dernier but FCA nommé. Résultat : « 23' CSC » parmi nos buteurs, à sa minute. Captions : « Contre son camp de <adversaire> » (but), « CSC (23') » (résultat).
- **Banc** — `tests/smoke.mjs` (tap CSC → export → relance → retrait), `tests/recap.mjs` scénarios E1-E5 (CSC seul, entre deux buteurs, dernier but, retrait, géométrie de la carte), `tests/parity.mjs` carte `goal-csc`. Cartes d'annonce identiques au pixel (cards.mjs avant/après).

## Chantier du 26.10.2026 — photos du match + cadrage
- **Demande Boss** — « bombarde ces images dans le match controller pour faire des stories ou posts dans tous les variants, et quand on choisit une photo, pouvoir modifier l'emplacement, la taille et les effets + ou − dominants ».
- **Photos** — `photos/<série>/<nom>.webp` (orientation EXIF appliquée, 2400 px de long, WebP q82, sans métadonnées) + `photos/<série>/thumbs/<nom>.jpg` (360 px) + `photos/manifest.json` (séries, la plus récente d'abord ; chemins relatifs au manifeste). Première série : `racing-2510` (58 photos du 25.10, ~13 Mo). **Nouveau match = une commande** : `python3 tools/match-photos.py <dossier-jpg> <id> "<label>" <AAAA-MM-JJ>` (crée le dossier, met à jour le manifeste ; relancer la même id la reconstruit).
- **Picker** — onglet Match → « Joueur en fond » → tuile **Photos** : la grille des vignettes (lazy) s'ouvre juste sous la rangée Auto / Shooting / Photos / Importer. Choisir = `state.heroPhoto` `{ set, id, url, thumb, w, h }` (des chemins, JAMAIS une dataURL ; persisté avec le snapshot du match) ; l'image passe par `loadAsset` → `MATCH_PHOTO_CACHE` (dataURL), attendue par `cardAssets()`, re-téléchargée par `refresh()` après une relance.
- **Toutes les cartes** — une photo du match est un visuel plein cadre (`mode 'bg'`) sur matchday, coup d'envoi, direct, mi-temps, résultat, ET sur la carte BUT (buteur nommé ou CSC) : c'est la seule exception à la loi du 15.08 « But = toujours le buteur » (shooting et import n'y passent toujours pas). Story et post. La compo n'a pas d'emplacement de visuel : inchangée.
- **Cadrage** (photo du match, shooting, import) — barre sous l'aperçu : glisser la photo SUR la carte (doigt ou souris, Pointer Events + `touch-action:none` le temps qu'une photo est là ; sous 6 px un tap reste un tap = export), **Recentrer**, **Taille** 100-300 % (pincement et ctrl+molette aussi ; le décor reste plafonné à 220 %), **Effets** de « photo pure » à « dominants » (aimanté sur le défaut, qui rend le look d'avant au chiffre près). État : `visualPos` {x,y} en %, `visualZoom`, `visualFx`, persistés. Changer de visuel remet position + taille à zéro, garde les effets.
- **Rendu** — `FB.plein()` : une `<img>` aux cotes px dans un cadre qui la rogne (pas de background agrandi : html2canvas en ferait un canvas de 50 Mpx à 300 % en post, refusé par iOS). Export = aperçu mesuré (`tests/photos.mjs`, écart moyen ≤ 2/255). Détail : DESIGN-SYSTEM-2627.md §4.
- **Banc** — `tests/photos.mjs` (chromium + webkit) ; `--export` sort les cartes de revue dans `validation-photos-2610/` (non commité).

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
| Test · smoke | `node tests/smoke.mjs` — boots the app on chromium + webkit (iPhone viewport) and exports one card through the real tap path |
| Test · export robustness | `node tests/stress.mjs` — seeded random user actions + an export after each, healthy/slow/flaky network, both engines; must end with 0 failure. `node tests/rootcause.mjs` replays each failure mechanism in isolation |
| Test · club names | `node tests/names.mjs` — naming rule + geometry (no overflow/clipping/overlap) on every card that prints a name |
| Test · result card | `node tests/recap.mjs` — every block of the recap present, inside the card and touching no other, for every combination of scorers, sponsors, format, home/away, visual and score; `--export --tag apres` → `validation-recap-1011/` |
| Test · export = preview | `node tests/parity.mjs` — html2canvas export vs the browser's own rendering |
| Test · match photos | `node tests/photos.mjs` — picker, drag / Recentrer / size / effects, relaunch, export = preview with a match photo; `--export` → `validation-photos-2610/` |
| Validation images | `node tests/cards.mjs --tag after` → `validation-cartes-1010/` (look at them: the PNG is the truth, never the preview alone) |
| Build | `n/a` — `index.html` is served as-is by GitHub Pages |
| Run locally | `open index.html` (or `python3 -m http.server 8000` then `http://localhost:8000`) |
| Deploy | `git add index.html && git commit && git push origin main` → Pages deploys in ~30-60s; verify with the `until curl … grep` loop above |

### Definition of done
The 7 poster variants render correctly in-browser (photos load, badges not clipped, no horizontal overflow at 1080px), the edit is surgical (only the lines that must change), and the deploy + live-verify loop has actually run when a real match was patched.

### Conventions to match (§0.3 Surgical Changes)
- Single-file architecture: everything lives in `index.html` (fonts base64-inline, crest SVG inline, html2canvas via CDN). No new files, no toolchain.
- New match = tap it in the Match tab fixture list when it's a season fixture; hand-edits are the fallback: patch the state block (~608-652: opponentSlug, homeAway, competition/competitionSub, matchNumber, venue/venueCity, kickoff, matchBallSponsors) + HTML fallback (~292) only; never rewrite surrounding code.
- Respect the "Pièges à NE PAS réintroduire" above (`.webp` not `.png`, badge sibling pattern, `getVariant().accent`, html2canvas clones only the poster, assets through `loadAsset()`, bounded waits, club names through `clubNames()`, result card through `FB.duel`/`FB.buteurs`, per-position counters).
- The tests run against a hermetic network (`tests/lib.mjs` intercepts every external request and answers from `tests/.cache`, filled from the live site on first use, never committed).
- Player photos `.webp` from `fc-atlantic-vevey.ch/players/`, club crests `.png` from `/logos/clubs/`; both fetched at runtime and cached as dataURL.
