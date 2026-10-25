"""SMOOTH THE PLAIN SURFACES' LIGHTMAPS (2026-10-25; Joey: "the wall texture looks gross and highly compressed, like maybe
we are making it too low res or scaling it wrong?"): a step after room.py's bake, before endpoint.py.

    python tools/done-scene/smooth-maps.py <bake dir> [--meshes wall_back,...] [--quality 82]

The walls, the floor and the window frame are plain colours, so their light is all their texture, and it is smooth: the
sun's edges are soft (its 2 degree disc) and nothing on them is finer. Their lightmaps hold the bake's grain (192
samples, no denoiser: 0.6 to 1.1 levels in a smooth patch of the back wall) and WebP's blocking of it. At about 6 mm a
texel, a close view magnifies each texel to many pixels and the bilinear filter draws the grain as soft blotches (1.20
levels of mottle on a sage wall seen from 600 mm, the same on High and Very High). blur5 (room.py's, 2 texels' reach)
over each map's covered texels only, the gutters between islands left out and their texels left as they were, takes
that to 0.59, and the file shrinks (the back wall 31,120 -> 15,044 bytes at the same WebP 82). A half-level dither in
display values keeps a smoothed gradient from banding in 8 bits. Textured surfaces (the desk's veneer, the props) are
not in the default list: their texture is in their bake.

Rewrites <bake dir>/room.glb with those images replaced (every other byte of the file kept, checked), keeps the bake's
own file as room.unsmoothed.glb, and records `smoothed` in room.json, with the SHA-256 of the bake it read (`source`)
and of the file it wrote (`output`). Run it on the dark bake too, before endpoint.py, so the walls' bounce is the
difference of two maps treated alike.

Which file is the bake (Sol 01a174d3: a kept copy must not stand in for a newer bake): room.py writes room.json anew,
with no `smoothed` record, so a room.json without one means room.glb is a fresh bake and becomes the kept copy. A
record whose `output` matches room.glb means room.glb is this tool's own last output, smoothed again from the kept copy
(as is a record from before the digests were kept). A record that matches neither, or a record without its kept copy
(the copy would be the smoothed file: smoothed twice), refuses to guess: --fresh takes room.glb as a new bake.
"""
import argparse, hashlib, io, json, os, shutil, struct
import numpy as np
from PIL import Image

PLAIN = 'wall_back,wall_left_a,wall_left_b,wall_left_c,wall_left_d,floor,win_sill,win_head,win_jamb_a,win_jamb_b'
ap = argparse.ArgumentParser()
ap.add_argument('bake')
ap.add_argument('--meshes', default=PLAIN)
ap.add_argument('--quality', type=int, default=82)
ap.add_argument('--seed', type=int, default=1)
ap.add_argument('--fresh', action='store_true', help='room.glb is a new bake: it replaces the kept room.unsmoothed.glb')
args = ap.parse_args()


def lin(s):
    return np.where(s <= 0.04045, s / 12.92, ((s + 0.055) / 1.055) ** 2.4)


def srgb(l):
    l = np.clip(l, 0.0, 1.0)
    return np.where(l <= 0.0031308, 12.92 * l, 1.055 * l ** (1 / 2.4) - 0.055)


def blur5(a):
    """room.py's: a separable 5-tap binomial blur over an (h, w, c) array, edges clamped"""
    k = np.array([1, 4, 6, 4, 1], dtype=np.float64) / 16.0
    h, w = a.shape[0], a.shape[1]
    p = np.pad(a, ((2, 2), (0, 0), (0, 0)), mode='edge')
    t = sum(k[i] * p[i:i + h] for i in range(5))
    p = np.pad(t, ((0, 0), (2, 2), (0, 0)), mode='edge')
    return sum(k[i] * p[:, i:i + w] for i in range(5))


def read_glb(path):
    b = open(path, 'rb').read()
    magic, version, total = struct.unpack('<III', b[:12])
    assert magic == 0x46546C67 and version == 2 and total == len(b), 'not a glTF 2 binary'
    jl, jt = struct.unpack('<II', b[12:20])
    assert jt == 0x4E4F534A, 'no JSON chunk first'
    j = json.loads(b[20:20 + jl])
    off = 20 + jl
    bl, bt = struct.unpack('<II', b[off:off + 8])
    assert bt == 0x004E4942, 'no BIN chunk second'
    return j, b[off + 8:off + 8 + bl]


def write_glb(path, j, binc):
    js = json.dumps(j, separators=(',', ':')).encode('utf-8')
    js += b' ' * (-len(js) % 4)
    binc += b'\0' * (-len(binc) % 4)
    total = 12 + 8 + len(js) + 8 + len(binc)
    with open(path, 'wb') as f:
        f.write(struct.pack('<III', 0x46546C67, 2, total))
        f.write(struct.pack('<II', len(js), 0x4E4F534A)); f.write(js)
        f.write(struct.pack('<II', len(binc), 0x004E4942)); f.write(binc)


def image_view(j, name):
    """the bufferView index of the named mesh's emissive (baked) image, and the image's index"""
    for nd in j['nodes']:
        if nd.get('name') != name or 'mesh' not in nd:
            continue
        mat = j['materials'][j['meshes'][nd['mesh']]['primitives'][0]['material']]
        tex = j['textures'][mat['emissiveTexture']['index']]
        src = tex.get('source', tex.get('extensions', {}).get('EXT_texture_webp', {}).get('source'))
        return j['images'][src]['bufferView'], src
    raise SystemExit('no baked mesh named %s' % name)


def digest(path):
    return hashlib.sha256(open(path, 'rb').read()).hexdigest()


bake = args.bake
glb = os.path.join(bake, 'room.glb')
raw = os.path.join(bake, 'room.unsmoothed.glb')
rj_path = os.path.join(bake, 'room.json')
rj = json.load(open(rj_path, encoding='utf-8'))
rec = rj.get('smoothed') or {}
if args.fresh or not rec:
    shutil.copyfile(glb, raw)   # a fresh bake (room.py's room.json has no record), or asked to be taken as one
elif not os.path.exists(raw):
    raise SystemExit('%s is missing and room.json records a smoothed room.glb (smoothing it again would smooth twice): bake again, or pass --fresh if room.glb is a bake' % raw)
elif rec.get('output') and digest(glb) != rec['output']:
    raise SystemExit('%s is neither this tool\'s last output nor a fresh bake\'s (room.json has a `smoothed` record): pass --fresh if it is a new bake' % glb)
j, binc = read_glb(raw)   # always from the bake's own file, so a second run does not smooth twice
names = [n for n in args.meshes.split(',') if n]
views = {}
for name in names:
    v, src = image_view(j, name)
    users = sum(1 for t in j['textures'] if t.get('source', t.get('extensions', {}).get('EXT_texture_webp', {}).get('source')) == src)
    assert users == 1, '%s: its image is shared by %d textures' % (name, users)
    views[v] = name
rng = np.random.default_rng(args.seed)
new, report = {}, []
for v, name in views.items():
    bv = j['bufferViews'][v]
    data = binc[bv.get('byteOffset', 0):bv.get('byteOffset', 0) + bv['byteLength']]
    s = np.asarray(Image.open(io.BytesIO(data)).convert('RGB')).astype(np.float64) / 255.0
    cover = s.sum(axis=2) > 3 / 255.0                        # the islands; the gutters between them are black
    L = lin(s)
    m3 = np.repeat(cover[..., None], 3, axis=2).astype(np.float64)
    num, den = blur5(L * m3), blur5(m3)
    sm = np.where(cover[..., None] & (den > 1e-6), num / np.maximum(den, 1e-6), L)
    out = np.clip(srgb(sm) * 255.0 + rng.uniform(-0.5, 0.5, sm.shape) + 0.5, 0, 255).astype(np.uint8)
    out = np.where(cover[..., None], out, (s * 255.0 + 0.5).astype(np.uint8))   # the gutters as baked (before the lossy encode, as the bake's own were)
    buf = io.BytesIO()
    Image.fromarray(out).save(buf, 'WEBP', quality=args.quality, method=6)
    new[v] = buf.getvalue()
    def detail(a):
        """the fine detail over the covered texels, in display levels: the grain, and the light's own edges with it"""
        if not cover.any():
            return None   # a near-black map (the dark bake's walls) covers nothing: it is left as baked
        p = a.mean(axis=2)
        k = blur5(np.repeat(p[..., None], 3, axis=2))[..., 0]
        return round(float((p - k)[cover].std()), 3)
    report.append((name, s.shape[1], s.shape[0], len(data), len(new[v]), detail(s * 255.0), detail(np.asarray(Image.open(io.BytesIO(new[v])).convert('RGB')).astype(np.float64))))
# the BIN chunk again, every bufferView in its order, the replaced images in their place, 4-byte aligned
order = sorted(range(len(j['bufferViews'])), key=lambda i: j['bufferViews'][i].get('byteOffset', 0))
out_bin = bytearray()
for i in order:
    bv = j['bufferViews'][i]
    data = new.get(i, binc[bv.get('byteOffset', 0):bv.get('byteOffset', 0) + bv['byteLength']])
    out_bin += b'\0' * (-len(out_bin) % 4)
    bv['byteOffset'] = len(out_bin); bv['byteLength'] = len(data)
    out_bin += data
j['buffers'][0]['byteLength'] = len(out_bin)
write_glb(glb, j, bytes(out_bin))
# checked: every bufferView that was not replaced holds the same bytes, every replaced image decodes at its size
j0, b0 = read_glb(raw)
j1, b1 = read_glb(glb)
for i, (v0, v1) in enumerate(zip(j0['bufferViews'], j1['bufferViews'])):
    d0 = b0[v0.get('byteOffset', 0):v0.get('byteOffset', 0) + v0['byteLength']]
    d1 = b1[v1.get('byteOffset', 0):v1.get('byteOffset', 0) + v1['byteLength']]
    if i in new:
        assert Image.open(io.BytesIO(d1)).size == Image.open(io.BytesIO(d0)).size, i
    else:
        assert d0 == d1, 'bufferView %d changed' % i
rj['smoothed'] = dict(meshes=names, filter='blur5 over each map\'s covered texels, a half-level dither, WebP %d' % args.quality,
                      bytes={r[0]: [r[3], r[4]] for r in report}, fineDetail={r[0]: [r[5], r[6]] for r in report},
                      source=digest(raw), output=digest(glb))
rj['glbBytes'] = os.path.getsize(glb)
json.dump(rj, open(rj_path, 'w', newline='\n'), indent=1)
print('wrote %s: %d -> %d bytes' % (glb, os.path.getsize(raw), os.path.getsize(glb)))
for name, w, h, b_in, b_out, g_in, g_out in report:
    print('  %-12s %4d x %-4d %6d -> %6d bytes, fine detail %s -> %s levels' % (name, w, h, b_in, b_out, g_in, g_out))
