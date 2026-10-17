# DESIGN SYSTEM 26/27 — Stories & posts FC Atlantic Vevey

Référence : stories Gil Vicente FC (photo-led, type flocage, air, zéro chrome).
Toute variante du Match Controller se construit sur CE système. Aucun élément
hors-système sans décision explicite de Boss.

## 1. Identité

| Rôle | Valeur |
|---|---|
| Fond | Bleu nuit `#04080F` → `#071630`, source lumineuse haut-droite `#17417F` |
| Accent | Bleu ROI maillot `#2E7BFF` (texte teinté `#5E9BFF`) |
| Célébration | Or `#F5B82E` — réservé : BUT, minute, parrains ballon, étoiles TBD, VICTOIRE |
| Alerte | Rouge doux `#F87171` — EXTÉRIEUR, but encaissé, DÉFAITE |
| Texte | Blanc, opacités 1 / .82 / .55 / .45 / .35 |

## 2. Typographie (les polices du MAILLOT)

| Usage | Police | Poids/taille |
|---|---|---|
| Titres display (jour, COUP D'ENVOI, EN DIRECT, MI-TEMPS, VICTOIRE, BUT !) | **Portugal2025 solid** | 120–200px |
| Grands chiffres (heure, score, minute) | **Portugal2025 Outlined** (barre 1969 native) | 96–158px |
| Sous-titres, dates, noms de clubs/joueurs | Portugal2025 solid | 40–58px |
| Micro-labels (kickers, venue, capitaine) | Inter 600/700, letter-spacing .26–.34em | 15–21px |
| Signature URL | Space Grotesk 700 | 14px |

**Garde-fou glyphes** : Portugal2025 n'a PAS Ê È À Ä Î Ï → tout texte dynamique
passe par `dispFontCss(texte)` (fallback Oswald 700). Jamais de Portugal2025
en dur sur un nom de club/joueur/lieu.

## 3. Grille story 1080×1920 (full-bleed, zéro cadre)

```
   0–230   SAFE ZONE Instagram (vide)
 238–560   HEADER — kicker micro + titre display à GAUCHE ;
           grand chiffre (heure/minute) à DROITE (right:72, text-align:right)
 480–1920  PHOTO HÉROS pleine largeur (1080×1440, contain, center top)
           → le visage tombe entre y850 et y1050
1020–1920  SCRIM bleu nuit (transparent → opaque, 5 paliers)
1290–1660  INFO STACK centrée (rangées selon variante)
1548       Rangée parrains ballon (si parrains)
1560/1660  Ligne venue (sans/avec parrains)
1626/1712  Signature tricolore 340×3px centrée
1644/1730  fc-atlantic-vevey.ch
   rail    #hashtag vertical, rotation -90°, x≈1044, y≈1050
```

Post 4:5 : MÊME composition dans un canvas virtuel scalé (ancres left/right).

### 3bis. Cartes d'AFFICHE — matchday + coup d'envoi (Boss 10.10)

« Les logos doivent être le centre de l'affiche, plus grands, plus en valeur,
avec le nom en dessous en plus petit, une belle carte avec un VS. » Sur ces deux
cartes le héros n'est plus la photo : ce sont les deux écussons.

```
STORY 1080×1920                               POST 1080×1350 (canvas virtuel 1536×1920)
 238       kicker (gauche) · label (droite)    138   header remonté de 100 : pas de zone
 282       titre 92 px · heure 96 px (droite)        morte Instagram en 4:5
 266–606   PORTRAIT centré, tête 340 px,       166–566  portrait, tête 400 px
           ENTRE le titre et l'heure                   titre 126 px · heure 118 px
 ≈556→836  nuit : les épaules s'éteignent
 ≈770–1190 ÉCUSSONS 420 px, domicile à gauche  ÉCUSSONS 560 px (394 px réels)
           VS (fonte du maillot) + 2 filets
 +36       NOMS OFFICIELS 45 px, même corps    60 px
 +30       lignes micro : capitaine, message
 1392…     pied standard (parrains, lieu,      pied descendu de 128
           signature) — inchangé
 rail      #hashtag à y1420 (sous l'écusson)   y1530
```

- **L'affiche se centre** entre le bas de la bande du header (menton du
  portrait, ou bas du header s'il n'y a pas de portrait) et le haut du pied :
  elle descend quand il n'y a pas de parrains, remonte en « carte nette ».
- **Le visuel devient l'atmosphère**, jamais le concurrent des écussons.
  Joueur : portrait à 0.74 d'opacité, la tête entièrement AU-DESSUS des
  écussons (aucun visage derrière un logo). Photo plein cadre (shooting,
  import) : voilée d'un seul tenant. Aucun visuel → la carte tient seule.
- **Halos** : plaque nuit + lumière, cyan néon de la saison pour nous, bleu roi
  pour l'adversaire. Aucun cadre, aucune pastille.
- **Un seul layout** : l'ancienne « carte de secours » du matchday et du coup
  d'envoi a disparu — l'affiche n'a besoin d'aucune photo pour exister.
- Le message du président (onglet Personnaliser) s'affiche en ligne micro sous
  les noms ; il n'apparaissait sur aucune carte photo auparavant.

### 3ter. Carte RÉSULTAT — recap (Boss 11.10)

« Seulement le résultat final » passe lui aussi en « logos au centre ». C'est
la MÊME affiche que l'annonce (`affichePoster`), avec le score final à la place
du VS. En direct, mi-temps et but gardent le visage du joueur en héros.

```
STORY 1080×1920                               POST 1080×1350 (canvas virtuel 1536×1920)
 238       kicker « RÉSULTAT FINAL · 26/27 »   138
           (gauche) · jour (droite)
 282       VERDICT 92 px · date 40 px (droite)       verdict 126 px · date 46 px
 266–606   PORTRAIT d'atmosphère (dernier      166–566
           buteur, sinon rotation / choix)
 centré    ÉCUSSONS 320 px (module × 0.762),   ÉCUSSONS 427 px (300 px réels)
           centres à ± 310 de l'axe
           SCORE Outlined 200 px entre eux     267 px (188 px réels)
           (140 px dès qu'un côté a deux       186 px (131 px réels)
           chiffres) · tiret sur l'axe + 2 filets
           · plaque nuit sous le score
 +30       NOMS OFFICIELS 45 px, même corps    60 px
 +30       message du président (ligne micro)
 +40       BUTEURS — label or 20 px (celui     lignes × 1.33,
           des parrains), lignes de 44 px :    label 20 px
           minute or 28 px + nom 30 px
 1392…     pied standard (parrains, lieu,      pied descendu de 128
           signature) — inchangé
```

- **Arrangement retenu : le score ENTRE les écussons.** L'autre piste (écussons
  en haut, score en ligne sous les noms) a été rendue et écartée : écussons
  plus petits (300 px), score détaché des clubs, pile de cinq étages qui écrase
  les buteurs sur les parrains. Planche : `validation-recap-1011/_essai-A-vs-B.jpg`.
- **Le score est la vedette, l'écusson reste le héros** : il cède un quart de
  sa largeur au score (420 → 320 px en story), pas plus. Les noms gardent le
  corps nominal de l'annonce (45 / 60 px) ; en story la place sous un écusson
  passe de 406 à 316 px, donc les plus longs se resserrent (FC RAPID-MONTREUX
  II 39 px, FC MONTREUX-SPORTS II et CS LA TOUR-DE-PEILZ II 37 px) et RACING
  CLUB LAUSANNE II prend sa forme curée RACING CLUB LS II — la loi §5quater,
  rien de plus. En post tous les noms officiels tiennent en entier.
- **Loi domicile / extérieur** : le club à domicile et SES buts à gauche. Le
  tiret reste sur l'axe de la carte, les chiffres s'y adossent (1 – 0, 10 – 0).
  Deux corps seulement ; un score hors norme (20 et plus) se resserre à la
  mesure, il ne touche jamais un écusson.
- **Verdict** = titre du header : VICTOIRE or `#F5B82E`, MATCH NUL blanc,
  DÉFAITE rouge doux `#F87171`. La date du match prend la place de l'heure du
  coup d'envoi (colonne droite) ; plus large qu'un jour de la semaine, le titre
  resserre son corps (MATCH NUL = 85 px en story, même ligne de base) : mesuré
  sur les 28 bustes de l'effectif, les cheveux descendent jusqu'à x386 à cette
  hauteur. Le kicker s'arrête lui aussi avant le crâne : « RÉSULTAT FINAL ·
  26/27 » (x474), pas « … · SAISON 26/27 » (x609, il coiffait le portrait).
- **Buteurs** : les nôtres uniquement, TOUS (jamais « + 2 autres »), un joueur
  qui marque plusieurs fois sur une ligne (« 9' + 19' NOM »). Jusqu'à 4
  marqueurs : un par ligne, centrés. Au-delà : deux par ligne adossés à l'axe
  de la carte, un point entre les deux — les points prolongent le tiret du
  score ; un dernier marqueur impair se centre. 8 marqueurs tiennent dans la
  hauteur de 4, le corps ne baisse pas.
- **Plaque nuit sous le score** (comme sous chaque écusson) : sur une photo
  plein cadre (shooting, import) les chiffres ne se lisent jamais sur un
  flocage. Elle est posée AVANT les écussons, elle ne les assombrit pas.
- **L'ensemble affiche + message + buteurs se centre** entre la bande du header
  et le pied. Si la place manque (7-8 marqueurs + parrains + message, surtout
  en post), le bloc des buteurs se resserre d'un seul tenant : jamais moins de
  36 px d'air au-dessus du pied, jamais un buteur sur un parrain.
- **Le portrait** : le dernier but FCA (à la minute) d'un joueur qui a un buste
  détouré — `recapScorer()`, UNE définition pour le poster, l'aperçu et
  l'export. Un invité buteur n'a pas de portrait : la carte retombe sur le
  visuel choisi (rotation, shooting, import). « Aucun visage » prime sur tout.
- **Un seul layout** : la « carte de secours » du recap a disparu, comme celle
  des cartes d'annonce.

## 4. Composants (implémentés dans `FB` — index.html)

- `FB.bg()` — radial nuit 9 paliers + nappe basse + aura haut-droite (TOUJOURS bleues)
- `FB.photo(dataUrl)` — halo royal derrière la tête + photo (dataURL only)
- `FB.scrim(topY)` — fondu bas 5 paliers → noir plein
- `FB.kicker(txt)` / `FB.titre(txt, size)` / `FB.chiffre(txt, size, color)` (Outlined)
- `FB.rail()` — hashtag vertical
- `FB.duel(top, size, score)` — L'AFFICHE : deux écussons face à face (home à
  gauche) sur leur halo, nom officiel dessous (même corps des deux côtés,
  ajusté par `fitDuel`), VS au centre. `size` = module de l'affiche, 420
  (story) / 560 (post) : c'est le côté d'un écusson sur une carte d'annonce.
  Avec `score` = `[domicile, extérieur]` (carte résultat), le score en chiffres
  du maillot remplace le VS et les écussons lui cèdent de la largeur (× 0.762).
  `FB.duelH(size, score)` donne la hauteur du bloc.
- `FB.buteurs(list, y, k)` — buteurs sous l'affiche du résultat : label or +
  lignes « minute or · nom », un par ligne jusqu'à 4, par paires au-delà.
  `list` = `[{ mins, name }]`, `k` = échelle du format. `FB.buteursH(n, k)`
  donne la hauteur du bloc. Son label est LE label or des parrains (Inter 700,
  20 px, .3em) : deux micro-labels or sur une carte, un seul style.
- `FB.atmosphere(img, band)` — le visuel en atmosphère des cartes d'affiche
  (portrait centré dans la bande du header, ou photo plein cadre voilée) + la
  nuit sous lui. `FB.isPortrait(img)` dit si un portrait sera rendu.
- `FB.note(html, y)` — ligne micro centrée (capitaine, message du président)
- `FB.scoreRow(y, size)` — crest 84 + score Outlined + crest 84
- `FB.sponsors(y)` — label or + logos blancs nus 150×46 (fallback nom flocage)
- `FB.venue(y)` + `FB.signature(y)` — pied standard
- `FB.timeBlock()` — heure Outlined roi OU –:– + ★★★ « heure à confirmer » (loi TBD)

## 5. Blueprints par variante

| Variante | Header gauche | Header droite | Info stack (sur scrim) | Héros photo |
|---|---|---|---|---|
| **matchday** | J-N·SAISON / JOUR / date / compét° | heure (timeBlock) | **AFFICHE héros** (`FB.duel`) · message · parrains · venue | portrait d'atmosphère (rotation, stable/match) |
| **kickoff** | IMMINENT / COUP · D'ENVOI (2 lignes) / sous-titre / compét° | heure | **AFFICHE héros** · capitaine (ligne micro) · message · parrains · venue | portrait d'atmosphère (rotation +1) |
| **live** | EN DIRECT (point rouge) / compét° | minute Outlined blanc | score géant · message d'état · venue | rotation |
| **halftime** | MI-TEMPS / compét° | 45' fixe | score géant · message · venue | rotation |
| **goal** | compét° micro | minute or | BUT ! or · nom buteur · venue | LE BUTEUR |
| **goal · CSC** (Boss 17.10) | BUT · SAISON 26/27 / BUT ! or / « contre son camp » / compét° | minute du but or | **AFFICHE** avec le score à la place du VS (`affichePoster`, `sponsors:false`) · message · venue | aucun (pas de buteur à nous) |
| **recap** | RÉSULTAT FINAL / verdict (or/blanc/rouge) / compét° | jour + date du match | **AFFICHE héros avec le SCORE à la place du VS** (`FB.duel(y, size, score)`) · message · buteurs (minutes or) · parrains · venue | portrait d'atmosphère : dernier buteur FCA, sinon rotation (§3ter) |
| **lineup** | COMPOSITION / jour+date | formation Outlined | terrain tactique (pas de photo héros) · banc · venue | — |

## 5bis. Grille verrouillée (audit panel DA, 11.08)

Ces valeurs ne sont PAS des suggestions — un panel de 4 DA indépendants a
mesuré les dérives qu'elles corrigent.

| Élément | Ancre | Règle |
|---|---|---|
| Kicker gauche | y238 | bleu `#5E9BFF`, Inter 700, 21px, .34em |
| Titre display | y282 | rampe FIXE : 156px, ou 126px si > 10 caractères. Jamais d'autre valeur. Exception décidée par Boss le 10.10 : cartes d'affiche (annonce et résultat) en story = 92px (heure 96px), le portrait vit entre les deux ; un titre plus large qu'un jour de la semaine s'y resserre à la mesure |
| Colonne droite | y238 (label) | `FB.colDroite(label, chiffre)` — micro-label sur la MÊME ligne de base que le kicker |
| Ligne compétition | y470-545 | opacité .66 minimum (mesuré 4.4:1 avant, ≥7:1 après) |
| Info stack | grandit vers le HAUT | dernier pixel de contenu ≤ **y1650** (Instagram masque les 250 derniers px) |
| Écusson | 92px | UN seul diamètre pour le même objet, halo sombre derrière (le blanc se perd sur le maillot clair) |

**Contrastes plancher** (mesurés sur l'export, pas estimés) : texte courant ≥ 7:1,
micro-label ≥ 4.5:1. Le bleu roi `#2E7BFF` tombe à 3.6:1 sur nuit → pour du TEXTE
on utilise `FB.royal` = `#5E9BFF`. Jamais de glow de la même teinte que le texte.

**Réserve de l'or** : BUT, minute du but, parrains ballon, étoiles TBD, VICTOIRE,
brassard capitaine. La minute d'un match en cours (live, mi-temps) est BLANCHE.

## 5ter. Montage du joueur (Boss 11.08)

Les portraits de la vitrine portent un fond studio **cuit dans l'image**. Une
version **détourée** vit désormais à côté sur le site :
`/players/cutout/<slug>.webp` (générée par `rembg` modèle `birefnet-portrait`,
exposée par le bundle en `photoCutoutUrl`).

- Le buste détouré est posé à **0.93 d'opacité**, hauteur **1700** ancrée y330 :
  le joueur occupe QUASIMENT toute la hauteur (loi Boss 11.08) et déborde
  donc du cadre en largeur. On le positionne par la **face** (centrée dans la
  découpe), pas par le bord : `left = faceX × largeurCanvas − largeur/2`,
  avec faceX = .63 (droite) / .37 (gauche) / .50 (centre).
- Un **voile haut** (620px, sans bord visible) garde le header lisible sur les
  cheveux — mesuré 18:1 sur les titres.
- **Image importée** : le président peut charger sa propre photo (tuile
  « Importer »). Elle porte son décor → rendue plein cadre (`cover`, ancrée
  22 % du haut), pas en buste. Réduite à 1400px / JPEG 0.86 avant stockage,
  sinon le quota localStorage explose et l'état du match est perdu.
- **Décalage par variante** (`FB.side`) — deux stories publiées à la suite ne
  montrent jamais l'image au même endroit :
  live **droite** · mi-temps **gauche** · but **centré** (c'est le buteur).
  Matchday, coup d'envoi et résultat n'ont plus de buste latéral : portrait
  centré dans la bande du header (§3bis, §3ter).
- **Choix du visage** : le président peut fixer le joueur de fond
  (`state.heroPlayerId`, onglet Match). Vide = rotation automatique sans
  répétition. La variante **But** ignore ce choix — son héros est le buteur.
- Précharger les découpes des rotations **+0, +1 et +2** ainsi que celle du
  buteur : sinon une variante retombe en silence sur la photo à fond studio
  et perd son décalage.
- Sans découpe en cache (offline) → cadrage centré + nappe qui masque la boîte.

- **Décors du club** (`bundle.scenes`) : 5 plateaux vides générés pour le FCA
  (mur néon au blason, tunnel de stade, vestiaire, faisceau de projecteur,
  cyclorama studio), servis depuis `/decors/`. Choisis dans l'onglet Match,
  ils remplacent le radial bleu nuit et passent **derrière** le joueur, avec
  un voile de lecture — le visage et le texte restent les points d'entrée.

**Régénérer les découpes** après une nouvelle photo :
`python3 scripts/cutouts.py` côté site, puis `vercel --prod`.

## 5quater. Noms de clubs (loi Boss 10.10)

Un club s'écrit avec son **nom officiel**, sur chaque poster, chaque caption,
chaque libellé de l'interface.

| Club | 1er choix | Repli | Dernier repli |
|---|---|---|---|
| Nous | FC ATLANTIC VEVEY | FC ATLANTIC | — jamais « ATLANTIC » seul |
| Adversaire | `OPPONENTS[].name` : FC SLAVIA LS, RACING CLUB LAUSANNE II | `mediumName` curé, le préfixe de club reste : RACING CLUB LS II, FC MONTREUX II, CS LA TOUR II | `shortName` : RACING II, MONTREUX II, LA TOUR II |

- **Le chiffre d'équipe (I, II, III, IA…) ne se perd jamais** : `clubNames()` le
  rend d'office à toute forme qui l'aurait oublié.
- **Le choix se fait à la mesure, pas au compte de lettres** : `fitName()` /
  `fitDuel()` prennent le plus long nom qui tient dans la largeur réelle, mesurée
  dans la fonte embarquée, à un corps acceptable (≥ 78 % du corps nominal).
  Face à face, les deux clubs ont le même corps.
- Sur les cartes d'affiche, tous les noms officiels de la saison tiennent en
  entier (45 px en story, 60 px en post).
- `abbr` (3-4 lettres) ne sert **qu'aux hashtags**.
- Interface : l'élément porte ses candidats (`data-names`), `fitUiNames()`
  descend d'un cran tant que le texte déborde.

## 6. Lois non négociables

- **Zéro chrome** : pas de cadre, pas de pastille décorative, pas de tuile bordée.
- **Heure inventée = interdite** : TBD → `–:–` + ★★★ SVG or + « heure à confirmer ».
- **Photos/logos = dataURL du cache uniquement** (jamais d'URL distante → taint export).
- **html2canvas-safe** : jamais `filter:`, `mix-blend`, `object-fit` sur img,
  `translate(-50%)` sur image débordante. Glows = text-shadow + radial-divs.
  Dans un dégradé, jamais le mot-clé `transparent` à côté d'une couleur : le
  canvas l'interpole vers du NOIR transparent (frange sale au bord du halo) —
  on fond vers la même couleur à alpha 0. Une image en `background-size`
  redimensionnée laisse filer sa dernière rangée en liseré au-dessus d'elle :
  la rogner de 3px dans un cadre `overflow:hidden`. Même remède pour un
  dégradé dont le bord haut tombe sur un demi-pixel (canvas scalé du post) :
  la nuit de `FB.atmosphere` laissait un liseré sombre d'1px sur toute la
  largeur des posts exportés depuis Chromium.
- **Fallback offline** : pas de photo cachée → layout carte historique (live,
  mi-temps, but). Matchday, coup d'envoi et résultat n'en ont plus besoin.
- **Une ligne reste une ligne** : nom de club, lieu → corps ajusté à la largeur
  mesurée, jamais de retour à la ligne improvisé sur l'élément du dessous.
- Vérité terrain : export PNG jugé, jamais le preview seul.
