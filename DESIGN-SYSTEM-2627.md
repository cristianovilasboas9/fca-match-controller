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

## 4. Composants (implémentés dans `FB` — index.html)

- `FB.bg()` — radial nuit 9 paliers + nappe basse + aura haut-droite (TOUJOURS bleues)
- `FB.photo(dataUrl)` — halo royal derrière la tête + photo (dataURL only)
- `FB.scrim(topY)` — fondu bas 5 paliers → noir plein
- `FB.kicker(txt)` / `FB.titre(txt, size)` / `FB.chiffre(txt, size, color)` (Outlined)
- `FB.rail()` — hashtag vertical
- `FB.matchup(y)` — crest 96 + nom + VS roi + nom + crest 96 (home à gauche)
- `FB.scoreRow(y, size)` — crest 84 + score Outlined + crest 84
- `FB.sponsors(y)` — label or + logos blancs nus 150×46 (fallback nom flocage)
- `FB.venue(y)` + `FB.signature(y)` — pied standard
- `FB.timeBlock()` — heure Outlined roi OU –:– + ★★★ « heure à confirmer » (loi TBD)

## 5. Blueprints par variante

| Variante | Header gauche | Header droite | Info stack (sur scrim) | Héros photo |
|---|---|---|---|---|
| **matchday** | MATCHDAY·SAISON / JOUR / date / compét° | heure (timeBlock) | matchup · parrains · venue | rotation (stable/match) |
| **kickoff** | IMMINENT / COUP D'ENVOI / sous-titre / compét° | heure | capitaine (ligne discrète) · matchup · parrains · venue | rotation +1 |
| **live** | EN DIRECT (point rouge) / compét° | minute Outlined blanc | score géant · message d'état · venue | rotation |
| **halftime** | MI-TEMPS / compét° | 45' fixe | score géant · message · venue | rotation |
| **goal** | compét° micro | minute or | BUT ! or · nom buteur · venue | LE BUTEUR |
| **recap** | RÉSULTAT FINAL / mot résultat (or/blanc/rouge) | score Outlined | buteurs (minutes or) · parrains · venue | dernier buteur FCA, sinon rotation |
| **lineup** | COMPOSITION / jour+date | formation Outlined | terrain tactique (pas de photo héros) · banc · venue | — |

## 5bis. Grille verrouillée (audit panel DA, 11.08)

Ces valeurs ne sont PAS des suggestions — un panel de 4 DA indépendants a
mesuré les dérives qu'elles corrigent.

| Élément | Ancre | Règle |
|---|---|---|
| Kicker gauche | y238 | bleu `#5E9BFF`, Inter 700, 21px, .34em |
| Titre display | y282 | rampe FIXE : 156px, ou 126px si > 10 caractères. Jamais d'autre valeur |
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
  matchday **droite** · kickoff **gauche** · live **droite** ·
  mi-temps **gauche** · recap **droite** · but **centré** (c'est le buteur).
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

## 6. Lois non négociables

- **Zéro chrome** : pas de cadre, pas de pastille décorative, pas de tuile bordée.
- **Heure inventée = interdite** : TBD → `–:–` + ★★★ SVG or + « heure à confirmer ».
- **Photos/logos = dataURL du cache uniquement** (jamais d'URL distante → taint export).
- **html2canvas-safe** : jamais `filter:`, `mix-blend`, `object-fit` sur img,
  `translate(-50%)` sur image débordante. Glows = text-shadow + radial-divs.
- **Fallback offline** : pas de photo cachée → layout carte historique.
- Vérité terrain : export PNG jugé, jamais le preview seul.
