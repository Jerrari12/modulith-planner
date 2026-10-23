"""Render a Done-scene round on node0 with MODULITH's own node0 runner (the FaderBox pattern, print-finish-render
skill): its GPU lock, reviewer parking and restore, detached launch, exit-code polling, lock extension and fetch, without
editing that shared script. It is imported and pointed at ~/render-assets/modulith-planner/done-scene.

    python tools/done-scene/node0_render.py look1            # sync, render jobs/look1.txt, fetch
    python tools/done-scene/node0_render.py look1 --dry-run

Inputs mirrored to node0: room.py, render_done.sh, the job file, and kit/ (the 185 2W2H golden manifest plus the GLBs
its instances need, from parts/185). Outputs land on node0 in ~/render-assets/modulith-planner/done-scene/renders/<round>
and here in D:/Claude - Output/done-scene-2026-10-23/renders/<round>/.
"""
import importlib.util
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
RUNNER = 'D:/MODULITH/scripts/render-on-node0.py'
LOCAL_OUT = 'D:/Claude - Output/done-scene-2026-10-23/renders'
KIT_MANIFEST = os.path.join(REPO, 'test', 'golden', '185-tabletop-2w2h.manifest.json')
PARTS = os.path.join(REPO, 'parts', '185')

if len(sys.argv) < 2:
    sys.exit(__doc__)
round_ = sys.argv[1]
extra = sys.argv[2:]
jobs = os.path.join(HERE, 'jobs', round_ + '.txt')
if not os.path.exists(jobs):
    sys.exit('no job file %s' % jobs)

if '--dry-run' not in extra and '--no-sync' not in extra:
    # the kit the look check places: the golden manifest and exactly the GLBs its instances name, DECODED for Blender
    # (the parts are meshopt-compressed and Blender's importer cannot read that: decode-glb.mjs, the stage's own decoder)
    kit_dir = os.path.join(HERE, 'kit')
    os.makedirs(os.path.join(kit_dir, 'parts'), exist_ok=True)
    m = json.load(open(KIT_MANIFEST, encoding='utf-8'))
    json.dump(m, open(os.path.join(kit_dir, 'manifest.json'), 'w'), indent=0)
    subprocess.run(['node', os.path.join(HERE, 'decode-glb.mjs'), KIT_MANIFEST, PARTS, os.path.join(kit_dir, 'parts')], check=True)
    files = ['room.py', 'render_done.sh', 'jobs/%s.txt' % round_, 'kit/manifest.json']
    for node in sorted({i['node'] for i in m['instances'] if not i['node'].startswith('WoodScrew')}):
        if os.path.exists(os.path.join(kit_dir, 'parts', node + '.lib.glb')):
            files.append('kit/parts/%s.lib.glb' % node)
    tar = subprocess.run(['tar', '-cf', '-'] + files, cwd=HERE, capture_output=True, check=True).stdout
    subprocess.run(['ssh', 'node0', 'mkdir -p ~/render-assets/modulith-planner/done-scene && cd ~/render-assets/modulith-planner/done-scene '
                    '&& tar -xf - && chmod +x render_done.sh && ls -la | head -20'], input=tar, check=True)

spec = importlib.util.spec_from_file_location('render_on_node0', RUNNER)
r = importlib.util.module_from_spec(spec)
sys.path.insert(0, os.path.dirname(RUNNER))          # for its `import gpu_lock`
spec.loader.exec_module(r)
r.CATALOG = 'modulith-planner/done-scene'            # relative to node0's ~/render-assets
r.LOCAL_CATALOG = HERE
# one output folder per round, so a fetch brings back only that round
r.BATCHES['donescene'] = {'script': 'render_done.sh', 'sub': 'renders/' + round_, 'env': 'DONE_OUT',
                          'minutes': 30, 'jobs': 'jobs/%s.txt' % round_}
argv = [RUNNER, '--batch', 'donescene', '--no-sync', '--local-out', os.path.join(LOCAL_OUT, round_)] + [a for a in extra if a != '--no-sync']
sys.argv = argv
sys.exit(r.main())
