"""The Done scene's room: the brief's Home office (desk against a wall, monitor, window light), in Blender.

One scene, three jobs (DESIGN.md in D:/Claude - Output/done-scene-2026-10-23, Joey's choice 2026-10-23: B, the
real-time lightmapped room, with a look check first):

  look   render a still of a kit on the desk at golden hour (Cycles) for Joey and Astra to direct;
  bake   bake the room's lighting into textures and export scenes/home-office/room.glb + room.json for the planner;
  check  build the scene, save the .blend, print the numbers (and a Workbench preview) - a build check, not a render.

  blender -b --factory-startup --python tools/done-scene/room.py -- --mode look --kit kit/manifest.json \
      --parts kit/parts --out-dir renders/look1 --res 2048x1365 --samples 160 [--exposure 0.01] [--post-only]

Conventions (keep them, the planner relies on them):
  * Blender works in METRES, Z up. The planner's stage is MILLIMETRES, Y up. The glTF importer and exporter convert
    axes both ways (glTF/stage +Y -> Blender +Z, glTF/stage +Z -> Blender -Y); the kit is imported with its mm numbers
    read as metres and parented to an empty scaled 0.001; the room exports in metres and the planner scales it x1000.
  * The TABLETOP ANCHOR is an empty named `anchor_tabletop` ON the desk top at the build zone's back-centre. The planner
    puts it at (build centre x, 0, build back z). `anchor_wall` and `anchor_under` mark the brief's other two anchors.
  * Props carry custom properties `slot` ("x+" / "x-") and `gap` (m): the planner slides a prop outward along its slot
    until it clears the build's box by `gap`. They export as glTF extras (userData in three.js).
  * The light is scene-linear and physical (a Nishita sky with its sun disc). `--exposure` scales it to display range
    in post, and the SAME scalar goes into room.json so the baked textures and the look check agree. The tone curve is
    three.js's Khronos PBR Neutral (NeutralToneMapping in tonemapping_pars_fragment), applied here in numpy, so the
    look check shows what the planner's tone tiers will show.
"""
import argparse
import json
import math
import os
import struct
import sys
import zlib

import bpy
from mathutils import Matrix, Vector, Euler

# ---------------------------------------------------------------------------------------------------------------------
# arguments
# ---------------------------------------------------------------------------------------------------------------------
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
ap = argparse.ArgumentParser()
ap.add_argument('--mode', choices=['look', 'bake', 'check'], default='check')
ap.add_argument('--kit', help='a kit manifest.json (test/golden/*.manifest.json): the build placed on the desk')
ap.add_argument('--parts', default='parts', help='folder with <node>.lib.glb')
ap.add_argument('--out-dir', default='out')
ap.add_argument('--name', default='look', help='output stem')
ap.add_argument('--res', default='2048x1365')
ap.add_argument('--samples', type=int, default=160)
ap.add_argument('--exposure', type=float, default=None, help='post scalar on the linear image; default: measured so the desk reads 0.55')
ap.add_argument('--post-only', action='store_true', help='re-apply exposure + Neutral to an existing <name>.exr, no render')
ap.add_argument('--sun-el', type=float, default=9.0, help='sun elevation, degrees')
ap.add_argument('--sun-strength', type=float, default=0.5, help='the sun disc\'s intensity multiplier (Nishita, 1 = physical). look1/look2 at 1.0: the lit faceplates sat 15x over the desk, and no exposure could keep both; a hazier evening sun halves that')
ap.add_argument('--sun-rot', type=float, default=242.0, help='sun rotation about the zenith, degrees. MEASURED 2026-10-23 (probe_sun, two rotations): Nishita puts the sun at (cos el * sin rot, cos el * cos rot, sin el), clockwise from +Y, so 242 is the left-front, through the window')
ap.add_argument('--cam-az', type=float, default=30.0, help='camera azimuth from the build front, degrees (+ = camera right)')
ap.add_argument('--cam-el', type=float, default=16.0, help='camera elevation, degrees')
ap.add_argument('--lens', type=float, default=35.0, help='mm on a 24 mm tall sensor (vertical fit)')
ap.add_argument('--fill', type=float, default=0.36, help='the build sphere fills this fraction of the frame height')
ap.add_argument('--bake-samples', type=int, default=192)
ap.add_argument('--skip-bake', action='store_true', help='bake mode without the bake: flat unlit colours, for developing the planner side locally')
ap.add_argument('--lm-scale', type=float, default=1.0, help='multiplies every lightmap size (a 0.0625 bake is a 20 s path check)')
ap.add_argument('--blend', help='save the scene here (check mode saves by default beside the output)')
ap.add_argument('--preview', action='store_true', help='check mode: a small Workbench preview (no Cycles)')
ap.add_argument('--sky-test', action='store_true', help='check mode: 8-sample sky-only Cycles probe to confirm the sun side')
args = ap.parse_args(argv)
W, H = (int(v) for v in args.res.lower().split('x'))
os.makedirs(args.out_dir, exist_ok=True)

# ---------------------------------------------------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------------------------------------------------
def srgb_hex(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4))

def to_linear(c):
    return tuple((v / 12.92) if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in c)

def mat(name, hex_or_rgb, rough=0.45, metal=0.0, spec=0.5, emit=None, emit_strength=1.0):
    """A Principled material in scene-linear colour. `emit` (hex) adds an emission on top (screens)."""
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes['Principled BSDF']
    rgb = to_linear(srgb_hex(hex_or_rgb)) if isinstance(hex_or_rgb, str) else hex_or_rgb
    bsdf.inputs['Base Color'].default_value = (*rgb, 1.0)
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    if 'Specular IOR Level' in bsdf.inputs:
        bsdf.inputs['Specular IOR Level'].default_value = spec
    if emit:
        e = to_linear(srgb_hex(emit))
        bsdf.inputs['Emission Color'].default_value = (*e, 1.0)
        bsdf.inputs['Emission Strength'].default_value = emit_strength
    return m

def box(name, size, loc, material, collection, rot=(0, 0, 0), extras=None):
    """An axis-aligned box: size (x, y, z) in metres, loc = its CENTRE."""
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.name = name
    o.scale = (size[0], size[1], size[2])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    o.data.materials.append(material)
    move_to(o, collection)
    for k, v in (extras or {}).items():
        o[k] = v
    return o

def cyl(name, r, h, loc, material, collection, verts=48, extras=None):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=h, location=loc, vertices=verts)
    o = bpy.context.active_object
    o.name = name
    o.data.materials.append(material)
    bpy.ops.object.shade_smooth()
    move_to(o, collection)
    for k, v in (extras or {}).items():
        o[k] = v
    return o

def sphere(name, r, loc, material, collection, scale=(1, 1, 1), extras=None):
    bpy.ops.mesh.primitive_ico_sphere_add(radius=r, subdivisions=3, location=loc)
    o = bpy.context.active_object
    o.name = name
    o.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    o.data.materials.append(material)
    bpy.ops.object.shade_smooth()
    move_to(o, collection)
    for k, v in (extras or {}).items():
        o[k] = v
    return o

def move_to(o, collection):
    for c in list(o.users_collection):
        c.objects.unlink(o)
    collection.objects.link(o)

def empty(name, loc, collection, extras=None):
    e = bpy.data.objects.new(name, None)
    e.location = loc
    e.empty_display_size = 0.05
    e.empty_display_type = 'ARROWS'
    collection.objects.link(e)
    for k, v in (extras or {}).items():
        e[k] = v
    return e

def new_collection(name):
    c = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(c)
    return c

# ---------------------------------------------------------------------------------------------------------------------
# the room (metres, Z up). The desk stands against the back wall; the window is in the LEFT wall, so the low sun rakes
# across the desk from the left-front and models the build's faces. Everything the camera sees sits inside ~3 m.
# ---------------------------------------------------------------------------------------------------------------------
DESK_TOP_Z = 0.74          # the desk top's upper surface = the planner's y = 0
DESK = dict(w=1.80, d=0.75, t=0.025)
WALL_BACK_Y = 0.80         # the back wall's face (the desk's back edge sits 0.02 in front of it)
WALL_LEFT_X = -1.60
GAP_TO_WALL = 0.045        # the build's back face to the wall
BUILD_X = -0.22            # the build zone's centre, left of the desk centre; the monitor takes the right

scene = bpy.context.scene
for o in list(scene.objects):
    bpy.data.objects.remove(o, do_unlink=True)
scene.unit_settings.system = 'METRIC'
scene.unit_settings.scale_length = 1.0

ROOM = new_collection('room')
KIT = new_collection('kit')
RIG = new_collection('rig')

M_WALL = mat('wall paint', '#e9e2d6', rough=0.85, spec=0.3)
M_FLOOR = mat('oak floor', '#a67c52', rough=0.5, spec=0.4)
M_DESK = mat('desk oak', '#b98a5a', rough=0.38, spec=0.45)
M_DESK_LEG = mat('desk steel', '#2b2d31', rough=0.5, metal=0.3)
M_DARK = mat('matte black plastic', '#1d1e21', rough=0.6)
M_SCREEN = mat('screen', '#0d1220', rough=0.15, emit='#1a2a4a', emit_strength=2.5)
M_WHITE = mat('ceramic white', '#f2f0ea', rough=0.12, spec=0.6)
M_TERRA = mat('terracotta', '#b5674a', rough=0.8)
M_SOIL = mat('soil', '#2a2119', rough=1.0)
M_LEAF = mat('leaf', '#3f7a3a', rough=0.55)
M_PAPER = mat('paper', '#f4f1e8', rough=0.9)
M_PEN = mat('pen', '#1b1c1f', rough=0.3)
M_FRAME = mat('picture frame', '#2a2724', rough=0.6)
M_PRINT = mat('print', '#c8c3b8', rough=0.9)
M_WINDOW_FRAME = mat('window frame', '#f5f3ee', rough=0.5)

def build_room():
    # floor and walls: planes large enough that no edge is in frame
    box('floor', (6.0, 6.0, 0.02), (0, 0, -0.01), M_FLOOR, ROOM, extras={'lm': 1024})
    box('wall_back', (6.0, 0.02, 3.0), (0, WALL_BACK_Y + 0.01, 1.5), M_WALL, ROOM, extras={'lm': 1024})
    # the left wall with a window opening: four slabs around a 1.0 x 1.4 opening whose sill is above the desk
    win = dict(y0=-0.35, y1=0.65, z0=0.95, z1=2.35)
    x = WALL_LEFT_X - 0.01
    box('wall_left_a', (0.02, 6.0, 3.0), (x, win['y0'] - 3.0, 1.5), M_WALL, ROOM, extras={'lm': 512})           # front of the window
    box('wall_left_b', (0.02, WALL_BACK_Y + 3.0 - win['y1'], 3.0), (x, (win['y1'] + WALL_BACK_Y + 3.0) / 2, 1.5), M_WALL, ROOM, extras={'lm': 512})
    box('wall_left_c', (0.02, win['y1'] - win['y0'], win['z0']), (x, (win['y0'] + win['y1']) / 2, win['z0'] / 2), M_WALL, ROOM, extras={'lm': 512})   # under the sill
    box('wall_left_d', (0.02, win['y1'] - win['y0'], 3.0 - win['z1']), (x, (win['y0'] + win['y1']) / 2, (win['z1'] + 3.0) / 2), M_WALL, ROOM, extras={'lm': 512})
    # window frame and a mullion, white, set into the opening
    f = 0.06
    for nm, size, loc in (
        ('win_sill', (0.12, win['y1'] - win['y0'] + 2 * f, f), (x, (win['y0'] + win['y1']) / 2, win['z0'] - f / 2)),
        ('win_head', (0.08, win['y1'] - win['y0'] + 2 * f, f), (x, (win['y0'] + win['y1']) / 2, win['z1'] + f / 2)),
        ('win_jamb_a', (0.08, f, win['z1'] - win['z0']), (x, win['y0'] - f / 2, (win['z0'] + win['z1']) / 2)),
        ('win_jamb_b', (0.08, f, win['z1'] - win['z0']), (x, win['y1'] + f / 2, (win['z0'] + win['z1']) / 2)),
    ):
        box(nm, size, loc, M_WINDOW_FRAME, ROOM, extras={'lm': 256})
    # the desk: a plain top on two steel slab legs, no apron (the brief's under-table anchor needs a thin, open top)
    desk_cy = WALL_BACK_Y - 0.02 - DESK['d'] / 2
    box('desk_top', (DESK['w'], DESK['d'], DESK['t']), (0, desk_cy, DESK_TOP_Z - DESK['t'] / 2), M_DESK, ROOM, extras={'lm': 1024})
    for sx in (-1, 1):
        box('desk_leg_%s' % ('l' if sx < 0 else 'r'), (0.03, DESK['d'] - 0.12, DESK_TOP_Z - DESK['t']),
            (sx * (DESK['w'] / 2 - 0.08), desk_cy, (DESK_TOP_Z - DESK['t']) / 2), M_DESK_LEG, ROOM, extras={'lm': 256})
    # the monitor, right of the build zone, on a stand (slot x+: slides right when the build is wide)
    mx, my = 0.55, WALL_BACK_Y - 0.02 - 0.20
    box('monitor_base', (0.26, 0.20, 0.012), (mx, my, DESK_TOP_Z + 0.006), M_DARK, ROOM, extras={'lm': 256, 'slot': 'x+', 'gap': 0.08, 'group': 'monitor'})
    box('monitor_neck', (0.05, 0.03, 0.14), (mx, my + 0.05, DESK_TOP_Z + 0.08), M_DARK, ROOM, extras={'lm': 128, 'slot': 'x+', 'gap': 0.08, 'group': 'monitor'})
    box('monitor_body', (0.62, 0.045, 0.37), (mx, my + 0.05, DESK_TOP_Z + 0.14 + 0.185), M_DARK, ROOM, extras={'lm': 512, 'slot': 'x+', 'gap': 0.08, 'group': 'monitor'})
    box('monitor_screen', (0.605, 0.004, 0.355), (mx, my + 0.05 - 0.0245, DESK_TOP_Z + 0.14 + 0.185), M_SCREEN, ROOM, extras={'lm': 512, 'slot': 'x+', 'gap': 0.08, 'group': 'monitor'})
    # keyboard and mouse in front of the monitor (same slot group)
    box('keyboard', (0.44, 0.14, 0.018), (mx, my - 0.33, DESK_TOP_Z + 0.009), M_DARK, ROOM, extras={'lm': 256, 'slot': 'x+', 'gap': 0.08, 'group': 'monitor'})
    sphere('mouse', 0.035, (mx + 0.30, my - 0.33, DESK_TOP_Z + 0.018), M_DARK, ROOM, scale=(0.9, 1.6, 0.55), extras={'lm': 128, 'slot': 'x+', 'gap': 0.08, 'group': 'monitor'})
    # a mug near the front, right of the build (slot x+, on its own)
    cyl('mug', 0.041, 0.096, (0.30, WALL_BACK_Y - 0.02 - 0.56, DESK_TOP_Z + 0.048), M_WHITE, ROOM, extras={'lm': 256, 'slot': 'x+', 'gap': 0.07, 'group': 'mug'})
    bpy.ops.mesh.primitive_torus_add(major_radius=0.03, minor_radius=0.006, location=(0.30 + 0.048, WALL_BACK_Y - 0.02 - 0.56, DESK_TOP_Z + 0.05), rotation=(math.radians(90), 0, 0))
    hnd = bpy.context.active_object; hnd.name = 'mug_handle'; hnd.data.materials.append(M_WHITE); bpy.ops.object.shade_smooth(); move_to(hnd, ROOM)
    hnd['lm'] = 128; hnd['slot'] = 'x+'; hnd['gap'] = 0.07; hnd['group'] = 'mug'
    # a plant at the far left, against the wall (slot x-)
    px, py = -0.70, WALL_BACK_Y - 0.02 - 0.16
    cyl('pot', 0.075, 0.14, (px, py, DESK_TOP_Z + 0.07), M_TERRA, ROOM, extras={'lm': 256, 'slot': 'x-', 'gap': 0.07, 'group': 'plant'})
    cyl('soil', 0.068, 0.01, (px, py, DESK_TOP_Z + 0.136), M_SOIL, ROOM, extras={'lm': 64, 'slot': 'x-', 'gap': 0.07, 'group': 'plant'})
    for i, (dx, dy, dz, s) in enumerate(((0, 0, 0.26, 1.0), (0.09, 0.04, 0.21, 0.8), (-0.08, -0.05, 0.23, 0.85), (0.03, -0.09, 0.19, 0.7), (-0.04, 0.08, 0.20, 0.75))):
        sphere('leaf_%d' % i, 0.085 * s, (px + dx, py + dy, DESK_TOP_Z + dz), M_LEAF, ROOM, scale=(1.0, 0.9, 0.7), extras={'lm': 128, 'slot': 'x-', 'gap': 0.07, 'group': 'plant'})
    # a notebook and a pen at the front right, beside the keyboard
    box('notebook', (0.15, 0.21, 0.012), (mx + 0.50, my - 0.30, DESK_TOP_Z + 0.006), M_PAPER, ROOM, rot=(0, 0, math.radians(-8)), extras={'lm': 256, 'slot': 'x+', 'gap': 0.08, 'group': 'monitor'})
    cyl('pen', 0.005, 0.14, (mx + 0.47, my - 0.34, DESK_TOP_Z + 0.017), M_PEN, ROOM, verts=16, extras={'lm': 64, 'slot': 'x+', 'gap': 0.08, 'group': 'monitor'})
    # a framed print on the back wall, above and right of the monitor
    box('frame', (0.42, 0.02, 0.32), (0.95, WALL_BACK_Y - 0.01, 1.62), M_FRAME, ROOM, extras={'lm': 256})
    box('frame_print', (0.36, 0.004, 0.26), (0.95, WALL_BACK_Y - 0.022, 1.62), M_PRINT, ROOM, extras={'lm': 256})
    # the anchors: tabletop ON the desk top at the build zone's back-centre; wall above it; under the desk top
    anchor_y = WALL_BACK_Y - GAP_TO_WALL
    empty('anchor_tabletop', (BUILD_X, anchor_y, DESK_TOP_Z), ROOM, extras={'anchor': 'tabletop'})
    empty('anchor_wall', (BUILD_X, WALL_BACK_Y - 0.001, DESK_TOP_Z + 0.55), ROOM, extras={'anchor': 'wall'})
    empty('anchor_under', (BUILD_X, anchor_y, DESK_TOP_Z - DESK['t']), ROOM, extras={'anchor': 'under-table'})
    return dict(anchor=(BUILD_X, anchor_y, DESK_TOP_Z),
                desk=dict(x0=-DESK['w'] / 2, x1=DESK['w'] / 2, y0=desk_cy - DESK['d'] / 2, y1=desk_cy + DESK['d'] / 2, z=DESK_TOP_Z))

def build_world():
    """A Nishita sky with its sun disc: the golden hour comes from the atmosphere, not from a hand-picked colour."""
    world = bpy.data.worlds.new('golden hour')
    scene.world = world
    world.use_nodes = True
    nt = world.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    sky = nt.nodes.new('ShaderNodeTexSky')
    sky.sky_type = 'NISHITA'
    sky.sun_disc = True
    sky.sun_size = math.radians(0.545)
    sky.sun_intensity = args.sun_strength
    sky.sun_elevation = math.radians(args.sun_el)
    sky.sun_rotation = math.radians(args.sun_rot)
    sky.altitude = 0
    sky.air_density = 1.0
    sky.dust_density = 2.2       # a hazier, warmer evening
    sky.ozone_density = 1.0
    bg = nt.nodes.new('ShaderNodeBackground')
    out = nt.nodes.new('ShaderNodeOutputWorld')
    nt.links.new(sky.outputs['Color'], bg.inputs['Color'])
    nt.links.new(bg.outputs['Background'], out.inputs['Surface'])
    return sky

def sun_direction():
    """Nishita's sun direction, unit, Blender axes, as MEASURED by probe_sun() on 2026-10-23 (the Cycles source's
    geographical_to_direction(elevation, rotation + 90) reading had x mirrored). probe_sun() still runs on every render
    and its value is the one room.json carries, because the live build's shadow in the planner must agree with the
    shadows baked here."""
    el, rot = math.radians(args.sun_el), math.radians(args.sun_rot)
    return Vector((math.cos(el) * math.sin(rot), math.cos(el) * math.cos(rot), math.sin(el)))

def probe_sun():
    """Find the sun disc: four 8-sample 128 px renders of the sky alone, one per facing, 90 degree fov; the brightest
    pixel of the four is the disc, and its camera ray is the sun direction. About three seconds. Restores visibility."""
    import numpy as np
    hidden = []
    for o in scene.objects:
        if o.type in ('MESH', 'CURVE') and not o.hide_render:
            o.hide_render = True
            hidden.append(o)
    keep = dict(engine=scene.render.engine, samples=scene.cycles.samples, denoise=scene.cycles.use_denoising,
                rx=scene.render.resolution_x, ry=scene.render.resolution_y, cam=scene.camera, fmt=scene.render.image_settings.file_format,
                depth=scene.render.image_settings.color_depth, path=scene.render.filepath)
    scene.render.engine = 'CYCLES'; scene.cycles.samples = 8; scene.cycles.use_denoising = False
    scene.render.resolution_x = scene.render.resolution_y = 128
    cam_data = bpy.data.cameras.new('sunprobe'); cam_data.lens = 18.0; cam_data.sensor_fit = 'HORIZONTAL'; cam_data.sensor_width = 36.0
    cam = bpy.data.objects.new('sunprobe', cam_data); RIG.objects.link(cam); cam.location = (0, 0, 1.3)
    best = (-1.0, None)
    tmp = os.path.join(args.out_dir, '_sunprobe.exr')
    for zrot in (0, 90, 180, 270):          # facing +Y, -X, -Y, +X
        cam.rotation_euler = (math.radians(90), 0, math.radians(zrot))
        scene.camera = cam
        bpy.context.view_layer.update()
        render_exr(tmp)
        lin = load_exr(tmp).mean(axis=2)
        iy, ix = np.unravel_index(int(lin.argmax()), lin.shape)
        if lin[iy, ix] > best[0]:
            n = lin.shape[0]
            u, v = (ix + 0.5) / n, (iy + 0.5) / n
            local = Vector(((u - 0.5) * 2.0, (0.5 - v) * 2.0, -1.0))   # 90 deg both ways: tan(45) = 1
            world = (cam.matrix_world.to_3x3() @ local).normalized()
            best = (float(lin[iy, ix]), world)
    for o in hidden:
        o.hide_render = False
    bpy.data.objects.remove(cam, do_unlink=True); bpy.data.cameras.remove(cam_data)
    scene.render.engine = keep['engine']; scene.cycles.samples = keep['samples']; scene.cycles.use_denoising = keep['denoise']
    scene.render.resolution_x, scene.render.resolution_y = keep['rx'], keep['ry']; scene.camera = keep['cam']
    scene.render.image_settings.file_format = keep['fmt']; scene.render.image_settings.color_depth = keep['depth']; scene.render.filepath = keep['path']
    try:
        os.remove(tmp)
    except OSError:
        pass
    return best[1], best[0]

# ---------------------------------------------------------------------------------------------------------------------
# the kit: the planner's manifest instances, each GLB imported once and instanced with the stage's transform
# ---------------------------------------------------------------------------------------------------------------------
PALETTE = {   # the site's art direction (viewer-capture skill), by part type; zones below
    'Case': '#dfe3ec', 'CaseExtender': '#dfe3ec', 'Drawer': '#3c3f45', 'Faceplate': '#ff8a40', 'Handle': '#17181a',
    'CoverL': '#2b2d31', 'CoverU': '#2b2d31', 'QuickLock': '#2b2d31', 'Stopper': '#2b2d31', 'MagnetClip': '#2b2d31',
    'Magnet': '#b8bcc4', 'Foot': '#17181a', 'FootAdhesive': '#17181a', 'FootrailL': '#8d9198', 'FootrailU': '#8d9198',
    'Rail': '#8d9198', 'Bracket': '#8d9198', 'Screw': '#9a9ea6', 'SideCover': '#dfe3ec', 'BackCover': '#2b2d31',
    'ShelfInsert': '#f0f2f5', 'ShelfLip': '#dfe3ec', 'Accent': '#ff8a40', 'Label': '#eef0f4',
}
ZONES = {('SideCover', 'FACE'): '#c2185b', ('Faceplate', 'GRIP'): '#ff8a40', ('Faceplate', 'GRIP ACCENT'): '#cdd2d9'}   # the stage's own: the grip wears the face colour, its accent silk silver (PRESETS)
CONV = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))   # glTF/stage (x, y, z) -> Blender (x, -z, y)
CONV_INV = CONV.inverted()

def kit_material(ptype, zone):
    hexv = ZONES.get((ptype, zone)) or PALETTE.get(ptype, '#c0c4cc')
    name = 'kit %s %s' % (ptype, zone or 'BODY')
    rough = 0.62 if ptype in ('Case', 'Drawer', 'CoverL', 'CoverU', 'SideCover') else 0.5
    metal = 0.85 if ptype == 'Magnet' else 0.0
    return mat(name, hexv, rough=rough, metal=metal, spec=0.45)

def import_template(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path, import_shading='NORMALS')
    new = [o for o in bpy.data.objects if o not in before]
    roots = [o for o in new if o.parent is None or o.parent not in new]
    for o in new:
        for c in list(o.users_collection):
            c.objects.unlink(o)
        KIT.objects.link(o)
        o.hide_render = True
        o.hide_viewport = True
    return roots, new

def place_kit(manifest_path, parts_dir, anchor):
    m = json.load(open(manifest_path, encoding='utf-8'))
    type_of = {p['node']: p['type'] for p in m.get('parts', []) if p.get('node')}
    templates = {}
    placed = []
    holder = bpy.data.objects.new('KIT', None)
    KIT.objects.link(holder)
    holder.scale = (0.001, 0.001, 0.001)
    for inst in m['instances']:
        node = inst['node']
        if node.startswith('WoodScrew'):
            continue
        if node not in templates:
            p = os.path.join(parts_dir, node + '.lib.glb')
            if not os.path.exists(p):
                print('[kit] missing GLB %s - skipped' % p)
                templates[node] = None
                continue
            roots, objs = import_template(p)
            ptype = type_of.get(node, 'Case')
            for o in objs:
                if o.type != 'MESH':
                    continue
                if not o.data.materials:
                    o.data.materials.append(kit_material(ptype, ''))
                for i, slot in enumerate(o.data.materials):
                    zone = slot.name if (slot and slot.name != 'BODY') else ''
                    o.data.materials[i] = kit_material(ptype, zone)
            templates[node] = roots
        roots = templates[node]
        if not roots:
            continue
        rot = inst.get('rot') or [0, inst.get('yaw', 0), 0]
        a = Matrix.Translation(Vector(inst['pos'])) @ Euler([math.radians(v) for v in rot], 'XYZ').to_matrix().to_4x4()
        xf = CONV @ a @ CONV_INV
        for root in roots:
            copies = {}
            for o in [root] + [c for c in root.children_recursive]:
                d = o.copy()
                if o.data:
                    d.data = o.data   # linked mesh data: one upload per node, like the stage's template clones
                d.hide_render = False
                d.hide_viewport = False
                d.name = '%s.%s' % (inst['id'], o.name)
                KIT.objects.link(d)
                copies[o] = d
            for o, d in copies.items():
                d.parent = copies[o.parent] if o.parent in copies else holder
                if o.parent in copies:
                    d.matrix_parent_inverse = o.matrix_parent_inverse.copy()
                    d.matrix_basis = o.matrix_basis.copy()
                else:
                    d.matrix_parent_inverse = Matrix.Identity(4)
                    d.matrix_basis = xf @ o.matrix_world
            placed.append(copies[root])
    holder.location = anchor
    # the planner puts the anchor at (build centre x, 0, build BACK z): shift the kit so its back face sits on the anchor
    bpy.context.view_layer.update()
    bb = kit_bounds(holder)
    if bb:
        lo, hi = bb   # world bounds with the holder AT the anchor: move it by the offset between where the kit's
        # (centre x, back y, bottom z) landed and the anchor, so the back face stands on the anchor
        holder.location = (holder.location.x + anchor[0] - (lo.x + hi.x) / 2,
                           holder.location.y + anchor[1] - hi.y,
                           holder.location.z + anchor[2] - lo.z)
        bpy.context.view_layer.update()
        lo, hi = kit_bounds(holder)
        print('[kit] placed: x %.3f..%.3f  y %.3f..%.3f  z %.3f..%.3f (m); anchor %s' % (lo.x, hi.x, lo.y, hi.y, lo.z, hi.z, tuple(round(v, 3) for v in anchor)))
    return holder, m

def kit_bounds(holder):
    lo = Vector((1e9, 1e9, 1e9)); hi = Vector((-1e9, -1e9, -1e9))
    found = False
    for o in holder.children_recursive:
        if o.type != 'MESH' or o.hide_render:
            continue
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            lo = Vector((min(lo.x, w.x), min(lo.y, w.y), min(lo.z, w.z)))
            hi = Vector((max(hi.x, w.x), max(hi.y, w.y), max(hi.z, w.z)))
            found = True
    return (lo, hi) if found else None

# ---------------------------------------------------------------------------------------------------------------------
# the camera: the hero three-quarter, fitted to the build's bounding sphere (the planner's fit maths, same inputs)
# ---------------------------------------------------------------------------------------------------------------------
def hero_camera(bb):
    lo, hi = bb
    centre = (lo + hi) / 2
    radius = (hi - lo).length / 2
    vfov = 2 * math.atan(12.0 / args.lens)
    dist = radius / (args.fill * math.tan(vfov / 2))
    az, el = math.radians(args.cam_az), math.radians(args.cam_el)
    # the build's FRONT is -Y in Blender (stage +Z); azimuth + swings the camera to the right (+X)
    direction = Vector((math.sin(az) * math.cos(el), -math.cos(az) * math.cos(el), math.sin(el)))
    target = centre + Vector((0, 0, -radius * 0.08))     # a touch below centre: the build sits just above the frame's middle
    cam_data = bpy.data.cameras.new('hero')
    cam_data.sensor_fit = 'VERTICAL'
    cam_data.sensor_height = 24.0
    cam_data.lens = args.lens
    cam_data.clip_start = 0.05
    cam_data.clip_end = 50
    cam = bpy.data.objects.new('hero', cam_data)
    RIG.objects.link(cam)
    cam.location = target + direction * dist
    cam.rotation_euler = (target - cam.location).to_track_quat('-Z', 'Y').to_euler()
    scene.camera = cam
    return dict(az=args.cam_az, el=args.cam_el, fovV=math.degrees(vfov), fill=args.fill, targetLift=-0.08,
                distance=dist, position=list(cam.location), target=list(target), radius=radius)

# ---------------------------------------------------------------------------------------------------------------------
# render settings
# ---------------------------------------------------------------------------------------------------------------------
def gpu_on():
    prefs = bpy.context.preferences.addons['cycles'].preferences
    for kind in ('OPTIX', 'CUDA'):
        try:
            prefs.compute_device_type = kind
            prefs.refresh_devices()
            got = False
            for d in prefs.devices:
                d.use = d.type == kind or d.type == 'CPU'
                got = got or d.type == kind
            if got:
                scene.cycles.device = 'GPU'
                return kind
        except Exception as e:   # noqa: BLE001 - a laptop without the card falls through to the CPU
            print('[gpu] %s: %s' % (kind, e))
    scene.cycles.device = 'CPU'
    return 'CPU'

def cycles(samples):
    scene.render.engine = 'CYCLES'
    dev = gpu_on()
    scene.cycles.samples = samples
    scene.cycles.use_adaptive_sampling = True
    scene.cycles.adaptive_threshold = 0.02
    scene.cycles.use_denoising = True
    scene.cycles.denoiser = 'OPENIMAGEDENOISE'
    scene.cycles.sample_clamp_indirect = 10.0
    scene.cycles.max_bounces = 8
    scene.render.resolution_x, scene.render.resolution_y = W, H
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = False
    try:
        scene.view_settings.view_transform = 'Standard'
        scene.view_settings.look = 'None'
    except TypeError:
        pass
    scene.view_settings.exposure = 0.0
    scene.view_settings.gamma = 1.0
    return dev

def render_exr(path):
    scene.render.image_settings.file_format = 'OPEN_EXR'
    scene.render.image_settings.color_depth = '16'
    scene.render.image_settings.exr_codec = 'ZIP'
    scene.render.image_settings.color_mode = 'RGB'
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)

# ---------------------------------------------------------------------------------------------------------------------
# post: exposure, Khronos PBR Neutral (three.js NeutralToneMapping, verbatim), sRGB, PNG - numpy only
# ---------------------------------------------------------------------------------------------------------------------
def load_exr(path):
    import numpy as np
    img = bpy.data.images.load(path)
    w, h = img.size
    buf = np.empty(w * h * img.channels, dtype=np.float32)
    img.pixels.foreach_get(buf)
    arr = buf.reshape(h, w, img.channels)[::-1, :, :3].copy()   # Blender stores bottom-up
    bpy.data.images.remove(img)
    return arr

def neutral(c):
    """three.js NeutralToneMapping on an (h, w, 3) linear array. StartCompression 0.76, Desaturation 0.15."""
    import numpy as np
    start, desat = 0.8 - 0.04, 0.15
    x = c.min(axis=2, keepdims=True)
    offset = np.where(x < 0.08, x - 6.25 * x * x, 0.04)
    c = c - offset
    peak = c.max(axis=2, keepdims=True)
    d = 1.0 - start
    new_peak = 1.0 - d * d / (peak + d - start)
    scale = np.where(peak < start, 1.0, new_peak / np.maximum(peak, 1e-6))
    cc = c * scale
    g = 1.0 - 1.0 / (desat * (peak - new_peak) + 1.0)
    out = np.where(peak < start, c, cc + (new_peak - cc) * g)
    return np.clip(out, 0.0, 1.0)

def to_srgb(c):
    import numpy as np
    return np.where(c <= 0.0031308, 12.92 * c, 1.055 * np.power(np.maximum(c, 0), 1 / 2.4) - 0.055)

def write_png(path, rgb01):
    import numpy as np
    h, w, _ = rgb01.shape
    data = (np.clip(rgb01, 0, 1) * 255 + 0.5).astype(np.uint8)
    raw = b''.join(b'\x00' + data[y].tobytes() for y in range(h))
    def chunk(tag, body):
        return struct.pack('>I', len(body)) + tag + body + struct.pack('>I', zlib.crc32(tag + body) & 0xffffffff)
    png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b'')
    open(path, 'wb').write(png)

def post(exr_path, png_path, exposure, probe_box=None):
    import numpy as np
    lin = load_exr(exr_path)
    if exposure is None:
        # measured on the SUBJECT's patch: its bright end (the 95th percentile of each pixel's brightest channel) lands at
        # 1.0, a touch over Neutral's 0.76 knee (its compression there is gentle: a peak of 1.0 maps to 0.88 with 2 %
        # desaturation), so a sunlit orange faceplate stays orange. (A median rule, on the desk or on the patch, put the
        # lit faces at 1.5 - 3.0 and they read salmon: look1, look2.)
        if probe_box:
            x0, y0, x1, y1 = probe_box
            patch = lin[y0:y1, x0:x1]
        else:
            patch = lin
        bright = float(np.percentile(patch.max(axis=2), 95))
        print('[post] subject patch %s: median %.3f, p95 of the brightest channel %.3f (raw)' % (str(probe_box), float(np.median(patch.mean(axis=2))), bright))
        exposure = 1.0 / max(bright, 1e-6)
    pct = np.percentile(lin.mean(axis=2) * exposure, [1, 50, 99, 99.9])
    print('[post] exposure %.5f  exposed percentiles 1/50/99/99.9: %s' % (exposure, ' '.join('%.3f' % v for v in pct)))
    write_png(png_path, to_srgb(neutral(lin * exposure)))
    return exposure, [float(v) for v in pct]

# ---------------------------------------------------------------------------------------------------------------------
# bake: every room mesh gets a lightmap UV and a baked diffuse (direct + indirect + colour, emission) texture, then the
# material becomes an unlit emission of that texture, which the glTF exporter writes as KHR_materials_unlit
# ---------------------------------------------------------------------------------------------------------------------
def bake_room(samples):
    import numpy as np   # noqa: F401 - asserts numpy is there before an hour of baking
    scene.cycles.samples = samples
    scene.cycles.use_denoising = False
    scene.render.bake.margin = 6
    scene.render.bake.use_clear = True
    scene.render.bake.use_selected_to_active = False
    meshes = [o for o in ROOM.objects if o.type == 'MESH']
    images = {}
    for o in meshes:
        size = max(16, int(int(o.get('lm', 256)) * args.lm_scale))
        # one material per object (shared materials would bake into one image several times)
        for i, m in enumerate(o.data.materials):
            if m.users > 1:
                o.data.materials[i] = m.copy()
        # the lightmap UV: a second channel, unwrapped per object
        bpy.ops.object.select_all(action='DESELECT')
        o.select_set(True)
        bpy.context.view_layer.objects.active = o
        if 'LM' not in o.data.uv_layers:
            o.data.uv_layers.new(name='LM')
        o.data.uv_layers['LM'].active = True
        o.data.uv_layers['LM'].active_render = True
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.03, correct_aspect=True, scale_to_bounds=True)
        bpy.ops.object.mode_set(mode='OBJECT')
        img = bpy.data.images.new('bake_' + o.name, size, size, alpha=False, float_buffer=True)
        img.colorspace_settings.name = 'Linear Rec.709' if 'Linear Rec.709' in [c.name for c in type(img.colorspace_settings).bl_rna.properties['name'].enum_items] else 'Non-Color'
        images[o.name] = img
        for m in o.data.materials:
            nt = m.node_tree
            tex = nt.nodes.new('ShaderNodeTexImage')
            tex.image = img
            tex.name = 'BAKE'
            uvn = nt.nodes.new('ShaderNodeUVMap')
            uvn.uv_map = 'LM'
            nt.links.new(uvn.outputs['UV'], tex.inputs['Vector'])
            for n in nt.nodes:
                n.select = False
            tex.select = True
            nt.nodes.active = tex
    # bake all at once (every selected object bakes into its own active image node)
    bpy.ops.object.select_all(action='DESELECT')
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.bake(type='COMBINED', pass_filter={'DIRECT', 'INDIRECT', 'DIFFUSE', 'EMIT'}, margin=6, use_clear=True)
    # the exported material: an unlit emission of the baked texture (exposure folded in, so the planner's linear values
    # match the look check's), read through the LM channel
    exposure = scene['done_exposure']
    for o in meshes:
        img = images[o.name]
        buf = np.empty(img.size[0] * img.size[1] * 4, dtype=np.float32)
        img.pixels.foreach_get(buf)
        buf = buf.reshape(-1, 4)
        raw_mean = float(buf[:, :3].mean())
        buf[:, :3] *= exposure
        img.pixels.foreach_set(buf.reshape(-1))
        img.update()
        print('[bake] %-16s %4d px  raw mean %.3f  exposed mean %.3f  max %.3f' % (o.name, img.size[0], raw_mean, float(buf[:, :3].mean()), float(buf[:, :3].max())))
        if o.name == 'desk_top':   # one map on disk, display-encoded, to look at
            w = img.size[0]
            write_png(os.path.join(args.out_dir, 'bake_desk_top.png'), to_srgb(np.clip(buf[:, :3].reshape(w, w, 3)[::-1], 0, 1)))
        for m in o.data.materials:
            nt = m.node_tree
            for n in list(nt.nodes):
                if n.name not in ('BAKE', 'Material Output') and n.bl_idname != 'ShaderNodeUVMap':
                    nt.nodes.remove(n)
            emit = nt.nodes.new('ShaderNodeEmission')
            emit.inputs['Strength'].default_value = 1.0
            nt.links.new(nt.nodes['BAKE'].outputs['Color'], emit.inputs['Color'])
            nt.links.new(emit.outputs['Emission'], nt.nodes['Material Output'].inputs['Surface'])
        # drop the first UV channel so the exporter writes the lightmap UV as TEXCOORD_0
        while len(o.data.uv_layers) > 1:
            o.data.uv_layers.remove(o.data.uv_layers[0] if o.data.uv_layers[0].name != 'LM' else o.data.uv_layers[1])
    return images

def export_room(path):
    bpy.ops.object.select_all(action='DESELECT')
    for o in ROOM.objects:
        o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_yup=True, export_apply=True,
                              export_materials='EXPORT', export_image_format='WEBP', export_image_quality=82,
                              export_extras=True, export_lights=False, export_cameras=False, export_animations=False,
                              export_skins=False, export_morph=False, export_texcoords=True, export_normals=True)

# ---------------------------------------------------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------------------------------------------------
def blender_to_stage(v):
    """Blender metres (x, y, z) -> stage mm (x, z, -y)."""
    return [round(v[0] * 1000, 3), round(v[2] * 1000, 3), round(-v[1] * 1000, 3)]

room = build_room()
sky = build_world()
sun = sun_direction()
holder, manifest = (None, None)
bb = None
if args.kit:
    holder, manifest = place_kit(args.kit, args.parts, room['anchor'])
    bb = kit_bounds(holder)
if not bb:   # no kit: frame a 2W2H-sized box on the anchor so the camera numbers still mean something
    ax, ay, az_ = room['anchor']
    bb = (Vector((ax - 0.088, ay - 0.195, az_)), Vector((ax + 0.088, ay, az_ + 0.134)))
cam = hero_camera(bb)
dev = cycles(args.samples)
stem = os.path.join(args.out_dir, args.name)
print('[scene] %d room meshes, kit %s, sun dir %s (Blender), camera %.2f m away at az %.0f el %.0f, fovV %.1f, device %s'
      % (len([o for o in ROOM.objects if o.type == 'MESH']), 'yes' if holder else 'no', tuple(round(v, 3) for v in sun), cam['distance'], cam['az'], cam['el'], cam['fovV'], dev))

info = dict(mode=args.mode, res=[W, H], samples=args.samples, sun=dict(elevation=args.sun_el, rotation=args.sun_rot, dirBlender=list(sun), dirStage=blender_to_stage(sun)),
            camera=cam, anchorBlender=list(room['anchor']), anchorStage=blender_to_stage(room['anchor']), desk=room['desk'],
            kit=os.path.basename(args.kit) if args.kit else None, device=dev)

if args.mode == 'check':
    blend = args.blend or stem + '.blend'
    bpy.ops.wm.save_as_mainfile(filepath=blend)
    print('[check] saved %s' % blend)
    if args.preview:
        scene.render.engine = 'BLENDER_WORKBENCH'
        scene.render.resolution_x, scene.render.resolution_y = 640, 427
        scene.render.image_settings.file_format = 'PNG'
        scene.render.filepath = stem + '.preview.png'
        bpy.ops.render.render(write_still=True)
        print('[check] preview %s' % scene.render.filepath)
    if args.sky_test:
        measured, peak = probe_sun()
        print('[sun] formula %s  measured %s  (peak %.1f)' % (tuple(round(v, 3) for v in sun), tuple(round(v, 3) for v in measured), peak))
        info['sun']['dirMeasured'] = list(measured)
        info['sun']['dirMeasuredStage'] = blender_to_stage(measured)
    json.dump(info, open(stem + '.check.json', 'w'), indent=1)

elif args.mode == 'look':
    exr = stem + '.exr'
    if not args.post_only:
        render_exr(exr)
    # the exposure probe: the SUBJECT. The build's box projected into the frame (look1 and look2 exposed the desk at
    # 0.55 / 0.42 and the sunlit faceplates landed at 1.5 - 2.1 linear, past Neutral's knee, so orange read salmon);
    # without a kit, a patch of desk in front of the anchor
    cam_obj = scene.camera
    import bpy_extras
    bpy.context.view_layer.update()   # the camera's world matrix: a render updates it, --post-only must do it itself (NaN exposure on 2026-10-23)
    if bb:
        lo, hi = bb
        us = [bpy_extras.object_utils.world_to_camera_view(scene, cam_obj, Vector((x, y, z))) for x in (lo.x, hi.x) for y in (lo.y, hi.y) for z in (lo.z, hi.z)]
        box_px = (max(0, int(min(u.x for u in us) * W)), max(0, int((1 - max(u.y for u in us)) * H)), min(W, int(max(u.x for u in us) * W)), min(H, int((1 - min(u.y for u in us)) * H)))
    else:
        p = Vector((room['anchor'][0], room['anchor'][1] - 0.32, DESK_TOP_Z))
        uv = bpy_extras.object_utils.world_to_camera_view(scene, cam_obj, p)
        px, py = int(uv.x * W), int((1 - uv.y) * H)
        box_px = (max(0, px - 40), max(0, py - 24), min(W, px + 40), min(H, py + 24))
    exposure, pct = post(exr, stem + '.png', args.exposure, box_px)
    measured, peak = probe_sun()
    info['sun']['dirMeasured'] = list(measured); info['sun']['dirMeasuredStage'] = blender_to_stage(measured)
    info.update(exposure=exposure, percentiles=pct, probeBox=box_px)
    json.dump(info, open(stem + '.json', 'w'), indent=1)
    bpy.ops.wm.save_as_mainfile(filepath=stem + '.blend')
    print('[look] wrote %s.png (exposure %.5f) and %s.blend' % (stem, exposure, stem))

elif args.mode == 'bake':
    if args.exposure is None:
        sys.exit('bake needs --exposure (the look check\'s measured value), so the textures match it')
    scene['done_exposure'] = args.exposure
    if holder:   # the room bakes WITHOUT the build; the planner's live model brings its own shadow
        for o in holder.children_recursive:
            o.hide_render = True
    measured, peak = probe_sun()   # the direction the planner's sun light takes, so the live shadow agrees with the baked ones
    if args.skip_bake:
        # flat: every material becomes an unlit emission of its own base colour (the same export path as a bake)
        for o in [o for o in ROOM.objects if o.type == 'MESH']:
            for i, m in enumerate(o.data.materials):
                if m.users > 1:
                    o.data.materials[i] = m = m.copy()
                nt = m.node_tree
                col = nt.nodes['Principled BSDF'].inputs['Base Color'].default_value[:]
                for n in list(nt.nodes):
                    if n.name != 'Material Output':
                        nt.nodes.remove(n)
                emit = nt.nodes.new('ShaderNodeEmission')
                emit.inputs['Color'].default_value = col
                emit.inputs['Strength'].default_value = 1.0
                nt.links.new(emit.outputs['Emission'], nt.nodes['Material Output'].inputs['Surface'])
    else:
        bake_room(args.bake_samples)
    glb = stem + '.glb'
    export_room(glb)
    sun_stage = blender_to_stage(measured)
    props = [dict(name=o.name, slot=o['slot'], gap=float(o['gap']), group=o.get('group', o.name)) for o in ROOM.objects if o.type == 'MESH' and 'slot' in o]
    desk = room['desk']
    room_json = dict(
        name='home-office', version=1, units='metres in the GLB, millimetres below', exposure=args.exposure,
        anchors={'tabletop': blender_to_stage(room['anchor']),
                 'wall': blender_to_stage((BUILD_X, WALL_BACK_Y - 0.001, DESK_TOP_Z + 0.55)),
                 'under-table': blender_to_stage((BUILD_X, room['anchor'][1], DESK_TOP_Z - DESK['t']))},
        # the desk top in stage mm, relative to the tabletop anchor: the shadow catcher's extent
        desk=dict(x0=round((desk['x0'] - room['anchor'][0]) * 1000, 1), x1=round((desk['x1'] - room['anchor'][0]) * 1000, 1),
                  zFront=round(-(desk['y0'] - room['anchor'][1]) * 1000, 1), zBack=round(-(desk['y1'] - room['anchor'][1]) * 1000, 1)),
        sun=dict(dir=sun_stage, color='#ffb876', intensity=2.6, elevation=args.sun_el),
        sky=dict(color='#e8d9c4', ground='#6b5a48', intensity=0.9),
        shots={'hero': dict(az=cam['az'], el=cam['el'], fovV=cam['fovV'], fill=cam['fill'], targetLift=cam['targetLift'])},
        props=props,
        glb=os.path.basename(glb), glbBytes=os.path.getsize(glb),
    )
    json.dump(room_json, open(stem + '.json', 'w'), indent=1)
    bpy.ops.wm.save_as_mainfile(filepath=stem + '.blend')
    print('[bake] wrote %s (%d bytes) and %s.json' % (glb, os.path.getsize(glb), stem))
