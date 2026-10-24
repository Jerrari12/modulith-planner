# silver_oak_veneer_01 (Poly Haven, CC0)

Photographed white-oak veneer, 2k JPG diffuse / roughness / normal (OpenGL), physical size 1000 x 1000 mm as documented
by Poly Haven (api.polyhaven.com/info/silver_oak_veneer_01, dimensions [1000, 1000]).
Source: https://polyhaven.com/a/silver_oak_veneer_01 - licence CC0 1.0 (public domain, no attribution required).
Fetched 2026-10-23 for the Done scene's desk (look12, Astra's direction: a photographed light oak at its documented
scale, low contrast, bump off first). room.py's wood_photo() maps it in object space at 1 m, box-projected so the top
and the front edge share one grain.

**Where the files are (Joey, 2026-10-23: "move the bake textures out of the repo to node0's mirror"):** the three JPGs
are NOT in git (`.gitignore`, 5.7 MB); they live on node0 at
`~/render-assets/modulith-planner/done-scene/textures/silver_oak_veneer_01/`, and `room.py`'s `texture()` fetches a
missing one over scp before loading it (a desktop or laptop checkout needs ssh to node0 on first use; node0's own copy
is in place). To add or replace a texture: `scp` it to that folder on node0 and record it here.
