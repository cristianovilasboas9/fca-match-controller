#!/usr/bin/env python3
"""Add (or replace) one set of match photos for the "Photos du match" picker.

    python3 tools/match-photos.py <src-folder-of-jpegs> <set-id> "<label>" <YYYY-MM-DD>
    e.g. python3 tools/match-photos.py ~/Desktop/racing racing-2510 "Racing LS II · 25.10" 2026-10-25

Writes photos/<set-id>/<name>.webp (EXIF orientation applied, long side 2400,
WebP q82, no metadata) and photos/<set-id>/thumbs/<name>.jpg (long side 360,
q78), then upserts the set in photos/manifest.json (newest date first, photos in
shooting order). Re-running with the same set id rebuilds that set. Needs Pillow.
"""
import json, os, re, sys
from PIL import Image, ImageOps

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PHOTOS = os.path.join(ROOT, 'photos')
MANIFEST = os.path.join(PHOTOS, 'manifest.json')
LONG, THUMB = 2400, 360


def shot_time(im):
    ex = im.getexif()
    return ex.get_ifd(0x8769).get(36867) or ex.get(306) or ''


def main(src, set_id, label, date):
    if not re.fullmatch(r'[a-z0-9-]+', set_id):
        sys.exit('set id: lowercase letters, digits and dashes only')
    out = os.path.join(PHOTOS, set_id)
    os.makedirs(os.path.join(out, 'thumbs'), exist_ok=True)
    files = [f for f in os.listdir(src) if f.lower().endswith(('.jpg', '.jpeg'))]
    items = []
    for f in files:
        name = re.sub(r'[^a-z0-9]+', '-', os.path.splitext(f)[0].lower()).strip('-')
        im = Image.open(os.path.join(src, f))
        when = shot_time(im)
        im = ImageOps.exif_transpose(im).convert('RGB')   # pixels upright, tag gone
        big = im.copy()
        big.thumbnail((LONG, LONG), Image.LANCZOS)
        big.save(os.path.join(out, name + '.webp'), 'WEBP', quality=82, method=6)
        small = im.copy()
        small.thumbnail((THUMB, THUMB), Image.LANCZOS)
        small.save(os.path.join(out, 'thumbs', name + '.jpg'), 'JPEG', quality=78, optimize=True, progressive=True)
        w, h = big.size
        items.append((when, name, {
            'id': name,
            'file': f'{set_id}/{name}.webp',
            'thumb': f'{set_id}/thumbs/{name}.jpg',
            'width': w, 'height': h,
            'orientation': 'portrait' if h > w else 'landscape' if w > h else 'square',
        }))
    items.sort(key=lambda t: (t[0], t[1]))
    manifest = {'version': 1, 'sets': []}
    if os.path.exists(MANIFEST):
        with open(MANIFEST, encoding='utf-8') as fh:
            manifest = json.load(fh)
    sets = [s for s in manifest.get('sets', []) if s.get('id') != set_id]
    sets.append({'id': set_id, 'label': label, 'date': date, 'items': [t[2] for t in items]})
    sets.sort(key=lambda s: s.get('date', ''), reverse=True)
    manifest['sets'] = sets
    with open(MANIFEST, 'w', encoding='utf-8') as fh:
        json.dump(manifest, fh, ensure_ascii=False, indent=1)
        fh.write('\n')
    print(f'{set_id}: {len(items)} photos -> {out}')


if __name__ == '__main__':
    if len(sys.argv) != 5:
        sys.exit(__doc__)
    main(*sys.argv[1:])
