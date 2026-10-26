"""The Done room's view out of the window, scenes/home-office/outside.webp (js/scenes/done.js THE VIEW OUT OF THE WINDOW).

    python tools/done-scene/outside-photo.py <preset> <source image> <out.webp> [preview.png]

Presets (Joey 2026-10-26; the sources stay out of the repo):
  garden   his own photo: the man-made things patched over with the trees and lawn beside them, the left 780 px.
  chatgpt  ChatGPT's clean version of it (1536 x 1024, nothing man-made): all but the leaning pine at its right edge.
  panorama ChatGPT's level 3:1 panorama of the place (2172 x 724): all of it.
Each: cropped, toned softer and a little brighter than the room, blurred (distant trees past a build in focus), the
lawn carried on below as a plain gradient faded in from its own last rows, and made tileable across by cross-fading its
right edge into its left. Prints the size and the lawn line's place from the top (done.js OUTSIDE.px and .ground)."""
import sys
from PIL import Image, ImageEnhance, ImageFilter, ImageDraw, ImageOps

PRESETS = {
    'garden': dict(patches=[((440, 875, 790, 992), 330), ((430, 995, 640, 1100), 230)], crop=(0, 300, 780, 1100), ground=965,
                   contrast=0.78, color=0.8, brightness=1.07, blur=2.2),
    'chatgpt': dict(patches=[], crop=(0, 230, 1290, 1024), ground=905, contrast=0.74, color=0.72, brightness=1.03, blur=2.5),
    'panorama': dict(patches=[], crop=(0, 0, 2172, 724), ground=596, contrast=0.74, color=0.74, brightness=1.02, blur=2.2),
}
preset, src, dst = sys.argv[1:4]
preview = sys.argv[4] if len(sys.argv) > 4 else None
P = PRESETS[preset]
im = Image.open(src).convert('RGB')


def patch(box, dx):   # the region dx px to the left, mirrored (so no tree repeats), over `box`, feathered
    x0, y0, x1, y1 = box
    piece = ImageOps.mirror(im.crop((x0 - dx, y0, x1 - dx, y1)))
    mask = Image.new('L', piece.size, 0)
    ImageDraw.Draw(mask).rectangle((10, 10, piece.size[0] - 10, piece.size[1] - 10), fill=255)
    im.paste(piece, (x0, y0), mask.filter(ImageFilter.GaussianBlur(7)))


for box, dx in P['patches']:
    patch(box, dx)
c = im.crop(P['crop'])
c = ImageEnhance.Contrast(c).enhance(P['contrast'])
c = ImageEnhance.Color(c).enhance(P['color'])
c = ImageEnhance.Brightness(c).enhance(P['brightness'])
c = c.filter(ImageFilter.GaussianBlur(P['blur']))   # out of focus (Joey: "the trees are at a distance and super sharp, i think that feels off")
W, H0, EXT, SKY = c.width, c.height, 900, 600
# the sky carried on above as its own top colour, faded in from its top rows mirrored up (a cylinder's top is then far
# above any look through the window: its cap, a flat colour, showed as a band where the photo ended)
skycol = c.crop((0, 0, W, 30)).resize((1, 1), Image.BOX).getpixel((0, 0))
up = Image.new('RGB', (W, SKY), skycol)
sb = 120
head = ImageOps.flip(c.crop((0, 0, W, sb)))
upfade = ImageOps.flip(Image.linear_gradient('L').resize((W, sb)))   # 255 far from the photo (plain), 0 at its edge
up.paste(Image.composite(Image.new('RGB', (W, sb), skycol), head, upfade), (0, SKY - sb))
joined = Image.new('RGB', (W, SKY + c.height)); joined.paste(up, (0, 0)); joined.paste(c, (0, SKY)); c = joined
H0 = c.height
out = Image.new('RGB', (W, H0 + EXT))
out.paste(c, (0, 0))
base = c.crop((0, H0 - 40, W, H0)).resize((1, 1), Image.BOX).getpixel((0, 0))
for y in range(EXT):   # the lawn on below: its own colour, a little darker nearer
    k = 1 - 0.06 * (y / EXT)
    out.paste(tuple(int(v * k) for v in base), (0, H0 + y, W, H0 + y + 1))
blend = 90   # the photo's last lawn, mirrored down and faded into the plain colour: no seam, no streaks
tail = ImageOps.flip(c.crop((0, H0 - blend, W, H0)))
fade = Image.linear_gradient('L').resize((W, blend))
out.paste(Image.composite(Image.new('RGB', (W, blend), base), tail, fade), (0, H0))
OV = 150   # tileable across: its right edge cross-faded into its left
T = out.crop((0, 0, out.width - OV, out.height))
ramp = Image.linear_gradient('L').rotate(90, expand=True).resize((OV, out.height))   # 0 at the left, 255 at the right
T.paste(Image.composite(out.crop((0, 0, OV, out.height)), out.crop((out.width - OV, 0, out.width, out.height)), ramp), (0, 0))
T.save(dst, quality=86, method=6)
if preview:
    T.save(preview)
print(T.size, 'horizon row (the middle of the source)', SKY + (P['crop'][3] - P['crop'][1]) // 2, 'sky', '#%02x%02x%02x' % skycol, 'lawn', '#%02x%02x%02x' % base)
