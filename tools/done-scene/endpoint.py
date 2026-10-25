"""THE WALLS' BOUNCE (2026-10-25; Joey: "Yes dark wall should also darken the rest of the room"): the light the walls bounce
onto every other surface, as one small atlas the planner blends by the visitor's wall colour.

    python tools/done-scene/endpoint.py <shipped bake dir> <black-wall bake dir> --share <share bake dir> [--factor 4] [--quality 90]

The shipped bake has the walls in their paint (room.json colours.wall, albedo w0 per channel) and the desk top's
light-only map (room.py --light-maps desk_top); the dark bake is the same room with near-black walls that bounce nothing
(--wall-hex #010101: Cycles bakes no light pass on a pure black colour) and light-only maps for the desk top and the walls
(a black wall's own bake holds no light). Light transport is linear and each colour channel its own, so a surface's
texture as a function of the walls' albedo w is close to a straight line between those two ends, channel by channel:
    L(w) = L(w0) - (1 - w / w0) * D,  D = L(w0) - L(0)
D, the walls' bounce, is smooth: it is stored at 1/factor of each lightmap's resolution (the sun's sharp edges stay in
the full-resolution bake, where L(w0) already has them). Kinds of entry:
  - bake:  D of a mesh's own texture (every room mesh but the walls; the desk top's oak among them);
  - light: D of the LIGHT on a surface whose colour the visitor sets, which the planner multiplies by that colour: the
    desk top's plain colours ('desk_top:light', from the two light-only maps), and the walls. A wall's bake over w0 is
    its light times c, the share of the paint the bake draws as diffuse (measured 0.9873 on every wall: the specular
    layer of the Principled BSDF over the paint takes the rest, so it is the same share in any paint). A wall's D is
    therefore its bake over w0 less c times its light-only map with black walls, c x (L(w0) - L(0)), the bounce the
    paint ratio's texture loses. c comes from --share, a bake of the same room in the shipped paint with light-only maps
    of the walls (jobs/bake5-share.txt): the median of its walls' baked albedo over w0. Taken as 1, it left each wall's
    D short by 1.3 % of its whole light: below zero on 9 to 28 % of the sunlit texels of wall_back, wall_left_a and
    wall_left_b, against 4 to 6 % with it (bake5, 2026-10-25). The bake reaches its 8-bit top only on faces outside the
    room, which no camera sees: the back wall's stretch past the left wall, and the left wall's outer face. No inner
    face or window reveal does (2026-10-25).
Each entry is averaged over its own covered texels only and pushed out into the gutters around its islands, so a
seam's bilinear sample never reads the empty space between islands. What is below 0 after the average is the two
bakes' noise, dropped there and not before, where it would have been summed into the bounce. Then packed (shelves, 2 px
apart) into one WebP, each entry with its own scale for the 8-bit range. Writes <shipped dir>/wall-bounce.webp and
merges `bounce` into <shipped dir>/room.json (the record the planner reads).
"""
import argparse, io, json, os, struct
import numpy as np
from PIL import Image

ap = argparse.ArgumentParser()
ap.add_argument('shipped')
ap.add_argument('dark')
ap.add_argument('--share', required=True, help='a bake of the same room in the shipped paint with light-only maps of the walls (jobs/bake5-share.txt): their baked albedo over w0 is c, the share of the paint the bake draws as diffuse')
ap.add_argument('--factor', type=int, default=4)
ap.add_argument('--small-factor', type=int, default=2, help='the reduction for lightmaps of --small px and under: thin islands (a window jamb, a leaf) blur into their neighbours at the factor of the big maps')
ap.add_argument('--small', type=int, default=256)
ap.add_argument('--quality', type=int, default=90)
ap.add_argument('--pad', type=int, default=2)
ap.add_argument('--width', type=int, default=1024)
args = ap.parse_args()


def glb_textures(path):
    """mesh name -> its baked (emissive) texture, linear float, rows as the file stores them (the planner's UV v down)"""
    b = open(path, 'rb').read()
    n = struct.unpack('<I', b[12:16])[0]
    j = json.loads(b[20:20 + n])
    off = 20 + n
    binc = b[off + 8:off + 8 + struct.unpack('<I', b[off:off + 4])[0]]
    out = {}
    for node in j['nodes']:
        if 'mesh' not in node:
            continue
        mat = j['materials'][j['meshes'][node['mesh']]['primitives'][0]['material']]
        t = mat.get('emissiveTexture')
        if not t:
            continue
        tex = j['textures'][t['index']]
        src = tex.get('source', tex.get('extensions', {}).get('EXT_texture_webp', {}).get('source'))
        bv = j['bufferViews'][j['images'][src]['bufferView']]
        data = binc[bv.get('byteOffset', 0):bv.get('byteOffset', 0) + bv['byteLength']]
        out[node['name']] = lin(np.asarray(Image.open(io.BytesIO(data)).convert('RGB')).astype(np.float64) / 255.0)
    return out


def lin(s):
    return np.where(s <= 0.04045, s / 12.92, ((s + 0.055) / 1.055) ** 2.4)


def srgb(l):
    l = np.clip(l, 0.0, 1.0)
    return np.where(l <= 0.0031308, 12.92 * l, 1.055 * l ** (1 / 2.4) - 0.055)


def hexlin(h):
    return lin(np.array([int(h[i:i + 2], 16) / 255.0 for i in (1, 3, 5)]))


def light_map(d, rec):
    return lin(np.asarray(Image.open(os.path.join(d, rec['file'])).convert('RGB')).astype(np.float64) / 255.0) / rec['scale']


def reduce(D, cover, f):
    """D averaged over f x f blocks of its COVERED texels; a block with none is filled from its covered neighbours
    (four rounds of an 8-neighbour mean), so the gutters hold their island's values"""
    h, w = cover.shape
    hh, ww = max(1, h // f), max(1, w // f)
    D, cover = D[:hh * f, :ww * f], cover[:hh * f, :ww * f]
    m = cover.reshape(hh, f, ww, f).astype(np.float64)
    s = (D.reshape(hh, f, ww, f, 3) * m[..., None]).sum(axis=(1, 3))
    cnt = m.sum(axis=(1, 3))
    have = cnt > 0
    out = np.where(have[..., None], s / np.maximum(cnt, 1)[..., None], 0.0)
    for _ in range(4):
        p = np.pad(out, ((1, 1), (1, 1), (0, 0)), mode='edge')
        q = np.pad(have, 1, mode='constant')
        acc = np.zeros_like(out)
        num = np.zeros(have.shape)
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                if dy == 0 and dx == 0:
                    continue
                sl = (slice(1 + dy, 1 + dy + hh), slice(1 + dx, 1 + dx + ww))
                acc += p[sl] * q[sl][..., None]
                num += q[sl]
        fill = ~have & (num > 0)
        out[fill] = acc[fill] / num[fill][:, None]
        have = have | fill
    return out, int(have.sum()), hh * ww


shipped_json = json.load(open(os.path.join(args.shipped, 'room.json'), encoding='utf-8'))
dark_json = json.load(open(os.path.join(args.dark, 'room.json'), encoding='utf-8'))
w0 = hexlin(shipped_json['colours']['wall'])
assert max(hexlin(dark_json['colours']['wall'])) < 0.002, 'the dark bake must have (near-)black walls: #010101, Cycles bakes no light pass on #000000'
share_json = json.load(open(os.path.join(args.share, 'room.json'), encoding='utf-8'))
assert share_json['colours']['wall'] == shipped_json['colours']['wall'], '--share must be baked in the shipped paint'
share = np.array([r['albedo'] for k, r in sorted(share_json.get('light', {}).items()) if k.startswith('wall_')])
assert len(share), '--share must hold light-only maps of the walls (room.py --light-maps wall_back,...)'
assert np.ptp(share, axis=0).max() < 1e-3, 'the walls disagree on their baked albedo: %s' % share.tolist()
c = np.median(share, axis=0) / w0   # the share of the paint the bake draws as diffuse, per channel
assert np.all((c > 0.9) & (c < 1.001)), 'a diffuse share of %s is no specular layer over a paint' % c.tolist()
L1 = glb_textures(os.path.join(args.shipped, 'room.glb'))
L0 = glb_textures(os.path.join(args.dark, 'room.glb'))
assert set(L1) == set(L0), 'the two bakes must hold the same meshes'
entries = []   # (key, mesh, kind, D at full resolution, cover)
for name in sorted(L1):
    a, b = L1[name], L0[name]
    assert a.shape == b.shape, name
    cover = (a.sum(axis=2) > 1e-5) | (b.sum(axis=2) > 1e-5)
    if name.startswith('wall_'):
        E1 = a / w0                                                 # c x the light on the wall, the walls in their paint
        E0 = c * light_map(args.dark, dark_json['light'][name])     # and with the walls black
        cover = (E1.sum(axis=2) > 1e-5) | (E0.sum(axis=2) > 1e-5)
        entries.append((name, name, 'light', E1 - E0, cover))
    else:
        entries.append((name, name, 'bake', a - b, cover))
if 'desk_top' in shipped_json.get('light', {}):
    E1 = light_map(args.shipped, shipped_json['light']['desk_top'])
    E0 = light_map(args.dark, dark_json['light']['desk_top'])
    cover = E1.sum(axis=2) > 1e-5
    entries.append(('desk_top:light', 'desk_top', 'light', E1 - E0, cover))

# reduce, then pack on shelves (tallest first), each tile padded by its own edge values
tiles = []
for key, mesh, kind, D, cover in entries:
    f = args.small_factor if D.shape[0] <= args.small else args.factor
    f = max(1, min(f, D.shape[0] // 16))   # no tile under 16 px
    small, filled, total = reduce(D, cover, f)
    small = np.maximum(small, 0.0)   # more bounce never darkens: below 0 after the average is the two bakes' noise
    peak = float(np.percentile(small, 99.9)) if small.size else 0.0
    scale = 0.9 / peak if peak > 1e-6 else 1.0
    tiles.append(dict(key=key, mesh=mesh, kind=kind, arr=small, scale=scale, f=f, src=D.shape[0], filled=filled, total=total))
tiles.sort(key=lambda t: -t['arr'].shape[0])
P, W = args.pad, args.width
x = y = shelf = 0
for t in tiles:
    h, w = t['arr'].shape[:2]
    if x + w + 2 * P > W:
        x, y, shelf = 0, y + shelf, 0
    t['rect'] = (x + P, y + P, w, h)
    x += w + 2 * P
    shelf = max(shelf, h + 2 * P)
H = y + shelf
atlas = np.zeros((H, W, 3))
for t in tiles:
    rx, ry, w, h = t['rect']
    tile = np.pad(t['arr'] * t['scale'], ((P, P), (P, P), (0, 0)), mode='edge')
    atlas[ry - P:ry + h + P, rx - P:rx + w + P] = tile
fname = 'wall-bounce.webp'
path = os.path.join(args.shipped, fname)
Image.fromarray((srgb(atlas) * 255 + 0.5).astype(np.uint8)).save(path, 'WEBP', quality=args.quality, method=6)
back = lin(np.asarray(Image.open(path).convert('RGB')).astype(np.float64) / 255.0)
err = float(np.abs(back - np.clip(atlas, 0, 1)).mean())
shipped_json['bounce'] = dict(
    file=fname, bytes=os.path.getsize(path), size=[W, H], wallAlbedo=[round(float(v), 5) for v in w0],
    wallShare=[round(float(v), 5) for v in c],
    note='L(w) = L(w0) - (1 - w/w0) * D per channel; D = texture(file, rect) / scale; kind light: of the light on the surface, which its colour multiplies (a wall\'s: its light x wallShare, which its paint multiplies)',
    meshes={t['key']: dict(mesh=t['mesh'], kind=t['kind'], rect=list(t['rect']), scale=round(t['scale'], 5), factor=t['f']) for t in tiles},
    readBack=round(err, 5))
json.dump(shipped_json, open(os.path.join(args.shipped, 'room.json'), 'w', newline='\n'), indent=1)
print('wrote %s: %dx%d, %d entries, %d bytes, read-back error %.5f' % (path, W, H, len(tiles), os.path.getsize(path), err))
for t in tiles:
    print('  %-16s %-5s %4d px / %d -> %3d px, filled %d of %d, scale %.3f' % (t['key'], t['kind'], t['src'], t['f'], t['arr'].shape[0], t['filled'], t['total'], t['scale']))
