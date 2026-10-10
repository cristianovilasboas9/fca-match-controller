#!/usr/bin/env python3
"""Builds stories/ (the asset kit of stories.html) from the club's story kit.

Usage:  python3 tools/build-stories-kit.py [--kit DIR] [--font OTF] [--mots JSON]

  --kit   folder holding Masques/ Logos/ Mots/ ACVF/   (default ~/Desktop/MASKFCA)
  --font  the PATCHED Portugal2025.otf                 (default: the site's /shop/font copy)
  --mots  mots.json of the word renderer, used only for readable labels (optional)

What it writes (everything is regenerated, the folder is safe to delete first):
  stories/masques/*.webp  the six masks, LOSSLESS (pixel-identical to the PNG, checked here)
  stories/logos|mots|acvf/*.webp  stickers cropped to their ink, <= 1024 px (words <= 1280), lossless
  stories/thumbs/*.webp   small lossy thumbnails for the sticker sheet
  stories/fonts/*         Portugal2025.otf + Inter/Oswald woff2 lifted from index.html
  stories/kit.js          the manifest read by stories.html AND stories-sw.js

After a rebuild, bump BUILD in stories-sw.js so phones drop their cached kit.
Needs Pillow (with WebP) and numpy.
"""
import argparse, base64, hashlib, io, json, os, re, shutil, sys
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'stories')

LOGOS = [  # file suffix, label — order of the sticker sheet
    ('sticker', 'Sticker à contour blanc'),
    ('blanc', 'Blanc'),
    ('blanc-aura-cyan', 'Blanc, halo cyan'),
    ('blanc-aura-roi', 'Blanc, halo bleu roi'),
    ('blanc-aura-or', 'Blanc, halo or'),
    ('blanc-contre-jour', 'Blanc, contre-jour'),
    ('bleu-club', 'Bleu club'),
    ('bleu-club-aura-blanc', 'Bleu club, halo blanc'),
    ('bleu-roi', 'Bleu roi'),
    ('cyan', 'Cyan'),
    ('degrade-blanc-cyan', 'Dégradé blanc-cyan'),
    ('degrade-blanc-or', 'Dégradé blanc-or'),
    ('or', 'Or'),
    ('or-aura-or', 'Or, halo or'),
    ('nuit', 'Bleu nuit'),
]
ACVF = [('sticker', 'ACVF sticker'), ('couleur', 'ACVF couleur'), ('blanc', 'ACVF blanc'), ('bleu', 'ACVF bleu')]
MASKS = {'club': 'Club', 'vainqueur': 'Vainqueur'}
WINDOWS = {'9x16': '9x16', '1x1': 'carree', '16x9': '16x9'}


def webp(im, path, **kw):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    im.save(path, 'WEBP', **kw)
    return os.path.getsize(path)


def lossless(im, path):
    n = webp(im, path, lossless=True, quality=100, method=6, exact=True)
    back = Image.open(path).convert('RGBA')
    a, b = np.array(im), np.array(back)
    vis = a[:, :, 3] > 0  # colour under fully transparent pixels is irrelevant
    if a.shape != b.shape or not np.array_equal(a[:, :, 3], b[:, :, 3]) or not np.array_equal(a[vis], b[vis]):
        sys.exit('lossless round-trip FAILED for ' + path)
    return n


def bbox(alpha, thr):
    ys, xs = np.where(alpha > thr)
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def sticker(src, dst, max_side):
    """Crop to the painted area, cap the long side, return the manifest entry."""
    im = Image.open(src).convert('RGBA')
    x0, y0, x1, y1 = bbox(np.array(im)[:, :, 3], 0)
    im = im.crop((max(x0 - 2, 0), max(y0 - 2, 0), min(x1 + 2, im.width), min(y1 + 2, im.height)))
    k = min(1.0, max_side / max(im.size))
    if k < 1:  # resize on premultiplied alpha, otherwise edges pick up the colour of invisible pixels
        im = im.convert('RGBa').resize((round(im.width * k), round(im.height * k)), Image.LANCZOS).convert('RGBA')
    size = lossless(im, dst)
    px = np.array(im)
    ink = bbox(px[:, :, 3], 128)  # the solid part: used for hit-testing, selection frame and default size
    # k = shipped pixels per source pixel: lets the page give every word the same letter height
    meta = {'w': im.width, 'h': im.height, 'ink': list(ink), 'k': round(k, 4)}
    solid = px[px[:, :, 3] > 128][:, :3].astype(np.float32)
    if (solid @ np.array([0.2126, 0.7152, 0.0722], np.float32)).mean() < 0.30 * 255:
        meta['dark'] = 1  # a dark sticker: the sheet shows it on a light tile
    return im, meta, size


def thumb(im, dst, side=300):
    t = im.convert('RGBa')
    t.thumbnail((side, side), Image.LANCZOS)
    return webp(t.convert('RGBA'), dst, quality=78, method=6, alpha_quality=55)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--kit', default=os.path.expanduser('~/Desktop/MASKFCA'))
    ap.add_argument('--font', default=os.path.expanduser('~/Business/fc-atlantic-vevey/public/shop/font/Portugal2025.otf'))
    ap.add_argument('--mots', default=os.path.expanduser('~/Business/STUDIO_MARKETING_IA/projects/fca/masques-instagram-2627/final/mots/mots.json'))
    a = ap.parse_args()
    for d in ('masques', 'logos', 'mots', 'acvf', 'thumbs', 'fonts'):
        shutil.rmtree(os.path.join(OUT, d), ignore_errors=True)
    total = 0
    kit = {'masks': {}, 'logos': [], 'mots': [], 'acvf': [], 'fonts': []}

    # --- masks: untouched pixels, lossless
    for fam in MASKS:
        kit['masks'][fam] = {}
        for win, suffix in WINDOWS.items():
            name = f'FCA-masque-{fam}-photo-{suffix}'
            im = Image.open(os.path.join(a.kit, 'Masques', name + '.png')).convert('RGBA')
            if im.size != (1080, 1920):
                sys.exit(name + ' is not 1080x1920')
            total += lossless(im, os.path.join(OUT, 'masques', name + '.webp'))
            kit['masks'][fam][win] = f'masques/{name}.webp'

    def add(group, folder, name, label, max_side, extra=None):
        nonlocal total
        src = os.path.join(a.kit, folder, name + '.png')
        if not os.path.exists(src):  # e.g. only five words exist in gold
            return
        im, meta, n = sticker(src, os.path.join(OUT, group, name + '.webp'), max_side)
        total += n + thumb(im, os.path.join(OUT, 'thumbs', name + '.webp'))
        kit[group].append({'id': name, 'f': f'{group}/{name}.webp', 't': f'thumbs/{name}.webp', 'label': label, **meta, **(extra or {})})

    for suffix, label in LOGOS:
        add('logos', 'Logos', 'FCA-logo-' + suffix, label, 1024)
    for suffix, label in ACVF:
        add('acvf', 'ACVF', 'FCA-acvf-' + suffix, label, 1024)

    # --- words: mots.json gives the order and the accented label; unknown files are appended
    words = []
    if os.path.exists(a.mots):
        words = [(w['slug'], ' '.join(w['lines'])) for w in json.load(open(a.mots, encoding='utf-8'))]
    known = {s for s, _ in words}
    for f in sorted(os.listdir(os.path.join(a.kit, 'Mots'))):
        m = re.match(r'FCA-mot-(.+)-(blanc|bleu|or)\.png$', f)
        if m and m.group(1) not in known:
            known.add(m.group(1))
            words.append((m.group(1), m.group(1).replace('-', ' ').upper()))
    for colour in ('blanc', 'bleu', 'or'):
        for slug, label in words:
            add('mots', 'Mots', f'FCA-mot-{slug}-{colour}', label, 1280, {'c': colour})

    # --- fonts: the club font + the two UI fonts already embedded in index.html
    os.makedirs(os.path.join(OUT, 'fonts'), exist_ok=True)
    shutil.copyfile(a.font, os.path.join(OUT, 'fonts', 'Portugal2025.otf'))
    html = open(os.path.join(ROOT, 'index.html'), encoding='utf-8').read()
    for fam in ('Inter', 'Oswald'):
        m = re.search(r"font-family: '%s';.*?src: url\(data:font/woff2;base64,([A-Za-z0-9+/=]+)\)" % fam, html, re.S)
        if not m:
            sys.exit(fam + ' not found in index.html')
        open(os.path.join(OUT, 'fonts', fam + '.woff2'), 'wb').write(base64.b64decode(m.group(1)))
    kit['fonts'] = ['fonts/Portugal2025.otf', 'fonts/Inter.woff2', 'fonts/Oswald.woff2']
    total += sum(os.path.getsize(os.path.join(OUT, f)) for f in kit['fonts'])

    # --- manifest; the version is a digest of every shipped byte
    h = hashlib.sha1()
    for base, _, files in sorted(os.walk(OUT)):
        for f in sorted(files):
            if f not in ('kit.js', '.DS_Store'):
                h.update(f.encode())
                h.update(open(os.path.join(base, f), 'rb').read())
    kit = {'version': h.hexdigest()[:10], **kit}
    js = '/* GENERATED by tools/build-stories-kit.py — do not edit by hand. */\nself.FCA_KIT = ' + json.dumps(kit, ensure_ascii=False, separators=(',', ':')) + ';\n'
    open(os.path.join(OUT, 'kit.js'), 'w', encoding='utf-8').write(js)
    print(f"kit {kit['version']}: {len(kit['logos'])} logos, {len(kit['mots'])} mots, {len(kit['acvf'])} ACVF, 6 masques, {total / 1e6:.1f} Mo")


if __name__ == '__main__':
    main()
