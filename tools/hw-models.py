"""The parts drawer's 3D contents models (2026-11-09, Joey: "these just feel way too over simplified ... you have the original parts
you rendered in blender right to create the images in the part picker?"). Converts the hardware visual library's own CAD (the
STEP files behind the Part Picker's renders: bd_warehouse geometry with real threads, knurls and sockets) into small meshes the
planner loads only for the parts it shows.

    C:/Users/Joey/.venvs/bd-warehouse/Scripts/python.exe tools/hw-models.py [type-size ...]

For each type and thread size in img/hw/index.json (the same asset as the part's picture) it writes img/hw/3d/<type>-<size>.bin:
- a nut, nyloc (its nylon ring a second piece), washer or insert: the whole part, one length;
- a screw (socket, button, countersunk) or set screw: three pieces, so the planner builds ANY length with a true thread. The model
  is turned head first (a rotation, never a mirror: the thread stays right-handed); its head height and threaded stretch are read
  from its own radius profile; it is cut into the HEAD (the head and a little thread), one whole-pitch SEGMENT (a thread repeats
  exactly along its axis every pitch) and the TIP (its chamfer). The planner lays segments end to end between the two.
A size the library has no model of (the picture's nearest-size stand-in) carries a scale to the right thread diameter.

The file: b'PDHW', version 1, a u32 header length, the JSON header (padded to 4), then per piece its positions as u16 x 3
quantized to the piece's box and its triangle indices (u16, or u32 above 65535 vertices). Normals are the planner's to compute.
"""
import json, os, struct, sys, math
import numpy as np
from build123d import import_step

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LIB = 'D:/MODULITH/handoffs/hardware-library/render-v2/models/'
OUT = os.path.join(ROOT, 'img', 'hw', '3d')
ASSETS = {x['id']: x for x in json.load(open('D:/Code Projects/GEN2 Part Picker/img/hw/v2/assets.json', encoding='utf-8'))['assets']}
PITCH = {'M2': 0.4, 'M2.5': 0.45, 'M3': 0.5, 'M4': 0.7, 'M5': 0.8, 'M6': 1.0, 'M8': 1.25, 'M10': 1.5, 'M12': 1.75}
DIA = {k: float(k[1:]) for k in PITCH}
SCREWS = {'shcs', 'bhcs', 'fhcs', 'set'}
FLAT = {'nut', 'nyloc', 'washer'}            # lie on a face: their axis stands up
TOL, ANG = 0.02, 0.3                        # the tessellation: 0.02 mm chordal, 0.3 rad angular


def mesh(step):
    s = import_step(step)
    v, f = s.tessellate(TOL, ANG)
    V = np.array([[p.X, p.Y, p.Z] for p in v], dtype=np.float64)
    F = np.array(f, dtype=np.int64)
    return V, F


def centre(V):
    lo, hi = V.min(0), V.max(0)
    V = V.copy(); V[:, 0] -= (lo[0] + hi[0]) / 2; V[:, 1] -= (lo[1] + hi[1]) / 2; V[:, 2] -= lo[2]
    return V


def profile(V, d, nb=400):
    """per axial slab: the largest radius, and the smallest radius of the OUTSIDE (vertices beyond a third of the thread, so a
    socket's walls do not count)"""
    z, r = V[:, 2], np.hypot(V[:, 0], V[:, 1])
    L = z.max(); edges = np.linspace(0, L, nb + 1)
    rmax, rmin = np.zeros(nb), np.full(nb, np.inf)
    b = np.clip(((z / L) * nb).astype(int), 0, nb - 1)
    np.maximum.at(rmax, b, r)
    out = r > d / 3
    np.minimum.at(rmin, b[out], r[out])
    return edges, rmax, rmin


def head_first(V, F, d, kind):
    """turn the model so its head (a set screw: its socket end) is at z = 0: a 180 degree turn about x, never a mirror"""
    L = V[:, 2].max(); r = np.hypot(V[:, 0], V[:, 1]); z = V[:, 2]
    if kind == 'set':   # the socket: vertices well inside the end, near the axis
        near0 = np.sum((r < 0.35 * d) & (z > 0.15) & (z < 0.9 * d)); nearL = np.sum((r < 0.35 * d) & (z < L - 0.15) & (z > L - 0.9 * d))
        flip = nearL > near0
    else:               # the head: the end whose outermost vertex is farther out (a cylinder has vertices only at its rims, so
        q = 0.3 * L      # slabs of it read empty: compare the ends' largest radius, not a mean over slabs)
        flip = r[z > L - q].max() > r[z < q].max()
    if flip:
        V = V.copy(); V[:, 1] *= -1; V[:, 2] = L - V[:, 2]
    return V, F


def clip(V, F, z0, z1):
    """the triangles between two planes, cut where they cross; new vertices are shared by the two triangles of an edge"""
    outV = list(map(tuple, V)); key = {}
    def cut(i, j, c):
        k = (min(i, j), max(i, j), c)
        if k not in key:
            a, b = V[i], V[j]; t = (c - a[2]) / (b[2] - a[2]); outV.append(tuple(a + t * (b - a))); key[k] = len(outV) - 1
        return key[k]
    def clip_poly(poly, c, keep_above):
        out = []
        for n in range(len(poly)):
            i, j = poly[n], poly[(n + 1) % len(poly)]
            zi, zj = outV[i][2], outV[j][2]
            ii = zi >= c if keep_above else zi <= c; jj = zj >= c if keep_above else zj <= c
            if ii: out.append(i)
            if ii != jj:
                # a cut of the ORIGINAL edge, when both ends are original vertices; otherwise a fresh one
                if i < len(V) and j < len(V): out.append(cut(i, j, c))
                else:
                    a, b = np.array(outV[i]), np.array(outV[j]); t = (c - a[2]) / (b[2] - a[2]); outV.append(tuple(a + t * (b - a))); out.append(len(outV) - 1)
        return out
    tris = []
    zs = V[:, 2]
    for t in F:
        zt = zs[t]
        if zt.max() <= z0 or zt.min() >= z1: continue
        poly = list(t)
        if zt.min() < z0: poly = clip_poly(poly, z0, True)
        if len(poly) >= 3 and zt.max() > z1: poly = clip_poly(poly, z1, False)
        for n in range(1, len(poly) - 1): tris.append((poly[0], poly[n], poly[n + 1]))
    used = sorted({i for t in tris for i in t}); remap = {o: n for n, o in enumerate(used)}
    return np.array([outV[i] for i in used]), np.array([[remap[i] for i in t] for t in tris], dtype=np.int64)


def screw_pieces(V, F, d, P, kind):
    e, rmax, rmin = profile(V, d)
    mid = (e[:-1] + e[1:]) / 2
    zEnd = V[:, 2].max()
    r = np.hypot(V[:, 0], V[:, 1])
    # the head is wider than the thread (whose crest is the major radius at most): its bottom is the farthest such vertex. 2 % over
    # the major radius finds a countersunk cone almost to where it meets the shank (12 % read an M3's 1.86 mm head as 1.21: Sol 01a1c1da)
    wide = r > d / 2 * 1.02
    k = float(V[wide, 2].max()) if kind != 'set' and wide.any() else 0.0
    # a cone meshes with vertices on its rims only, and its bottom rim IS the thread's radius: a 90 degree countersink's height is
    # (head diameter - thread diameter) / 2 (ISO 10642), whatever vertex the mesh happens to have
    if kind == 'fhcs': k = max(k, float(r.max() - d / 2))
    threaded = (rmin < d / 2 - 0.3 * 0.6134 * P) & (mid > k)
    tz = mid[threaded]
    if len(tz) < 4: raise ValueError('no thread found')
    t0 = float(tz.min())
    zA = max(k + 2 * P, t0 + P)
    Tmin = 1.6 * P
    m = math.floor((zEnd - zA - Tmin) / P)
    if m < 1: raise ValueError(f'thread too short to cut: {zEnd - zA:.2f} mm')
    zT = zA + m * P; T = zEnd - zT
    # the head and the tip keep their outer ends whole: a face lying ON z = 0 or z = zEnd is not cut away (it was: the end faces went)
    pieces = [('head', -math.inf, zA), ('seg', zA, zA + P), ('tip', zT, math.inf)]
    out = []
    hand = None
    for name, a, b in pieces:
        pv, pf = clip(V, F, a, b)
        if name == 'seg': pv = pv.copy(); pv[:, 2] -= a; hand = thread_hand(pv, d, P)          # a segment starts at 0
        if name == 'tip': pv = pv.copy(); pv[:, 2] -= zT         # so does the tip
        out.append((name, 'part', pv, pf))
    return out, {'k': round(float(k), 4), 'a': round(float(zA - k), 4), 'P': float(P), 'T': round(float(T), 4), 'L0': round(float(zEnd - k), 4), 'hand': hand}


def thread_hand(seg, d, P):
    """which way the thread turns as z grows: +1 when its surface is r(theta - 2 pi z / P), -1 for r(theta + 2 pi z / P). Read
    from the segment itself: binned by that phase, the right sense gives a sharp profile (the least spread of radius per bin).
    The planner turns the tip by hand * 2 pi * remainder / P, so a length that is not a whole number of pitches keeps one helix."""
    r = np.hypot(seg[:, 0], seg[:, 1]); o = r > d * 0.4
    th, z, r = np.arctan2(seg[o, 1], seg[o, 0]), seg[o, 2], r[o]
    best = None
    for h in (1, -1):
        u = np.mod(th - h * 2 * np.pi * z / P, 2 * np.pi); b = (u / (2 * np.pi) * 72).astype(int)
        spread = sum(float(np.var(r[b == i])) for i in range(72) if np.any(b == i))
        if best is None or spread < best[0]: best = (spread, h)
    return best[1]


def pack(pieces, header):
    blobs, hp = [], []
    for name, mat, pv, pf in pieces:
        lo, hi = pv.min(0), pv.max(0); span = np.maximum(hi - lo, 1e-9)
        q = np.round((pv - lo) / span * 65535).astype('<u2')
        big = len(pv) > 65535
        idx = pf.astype('<u4' if big else '<u2')
        pb, ib = q.tobytes(), idx.tobytes()
        if len(pb) % 4: pb += b'\0' * (4 - len(pb) % 4)
        hp.append({'name': name, 'mat': mat, 'lo': [round(float(x), 5) for x in lo], 'hi': [round(float(x), 5) for x in hi], 'v': int(len(pv)), 't': int(len(pf)), 'u32': big})
        blobs += [pb, ib if len(ib) % 4 == 0 else ib + b'\0' * (4 - len(ib) % 4)]
    header = {**header, 'pieces': hp}
    hj = json.dumps(header, separators=(',', ':')).encode()
    hj += b' ' * ((4 - len(hj) % 4) % 4)
    return b'PDHW' + bytes([1, 0, 0, 0]) + struct.pack('<I', len(hj)) + hj + b''.join(blobs)


def build(t, size, pick):
    a = pick['asset']; step = LIB + a + '.step'
    V, F = mesh(step); V = centre(V)
    # the model's own thread diameter, from the library's asset index (an id like m6-1 is M6 x 1.0 pitch, not M6.1)
    da = float(ASSETS.get(a, {}).get('d') or DIA[size])
    scale = DIA[size] / da
    head = {'v': 1, 'type': t, 'size': size, 'asset': a, 'scale': round(scale, 5), 'near': bool(pick['near']), 'source': 'MODULITH hardware visual library, render-v2 STEP (bd_warehouse geometry)'}
    if t in SCREWS:
        V, F = head_first(V, F, da, t)
        pieces, sc = screw_pieces(V, F, da, PITCH.get(f'M{da:g}', PITCH[size]), t)
        head['screw'] = sc
    else:
        pieces = [('body', 'part', V, F)]
        nyl = LIB + a + '__nylon.step'
        if t == 'nyloc' and os.path.exists(nyl):
            NV, NF = mesh(nyl); lo, hi = mesh(step)[0].min(0), mesh(step)[0].max(0)
            NV = NV.copy(); NV[:, 0] -= (lo[0] + hi[0]) / 2; NV[:, 1] -= (lo[1] + hi[1]) / 2; NV[:, 2] -= lo[2]
            pieces.append(('nylon', 'nylon', NV, NF))
    head['flat'] = t in FLAT
    return pack(pieces, head), head, sum(len(p[3]) for p in pieces)


if __name__ == '__main__':
    idx = json.load(open(os.path.join(ROOT, 'img', 'hw', 'index.json'), encoding='utf-8'))['picks']
    want = set(sys.argv[1:])
    os.makedirs(OUT, exist_ok=True)
    total, report = 0, []
    for t, sizes in idx.items():
        for size, pick in sizes.items():
            name = f"{t}-{size.lower().replace('.', '-')}"
            if want and name not in want: continue
            if t == 'insert' and size in ('M8', 'M10', 'M12'): continue   # the list offers inserts to M6 (inventory.js INSERT)
            try:
                blob, head, tris = build(t, size, pick)
            except Exception as ex:
                report.append(f'{name}: FAILED {ex}'); continue
            open(os.path.join(OUT, name + '.bin'), 'wb').write(blob); total += len(blob)
            report.append(f"{name}: {tris} tris, {len(blob) // 1024} KB" + (f", screw {head['screw']}" if 'screw' in head else '') + (f", scale {head['scale']}" if head['scale'] != 1 else ''))
    print('\n'.join(report)); print('total KB', total // 1024)
