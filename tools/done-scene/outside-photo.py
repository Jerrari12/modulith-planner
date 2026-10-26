"""The window's outside from Joey's garden photo (2026-10-26): the man-made things patched over with the trees and lawn
beside them, a crop of the left 780 px, toned softer, and the lawn carried on below as a plain gradient."""
import sys
from PIL import Image, ImageEnhance, ImageFilter, ImageDraw
src, dst, preview = sys.argv[1:4]
im = Image.open(src).convert('RGB')
from PIL import ImageOps
def patch(box, dx, flip=False):   # copy the region dx px to the left over `box` (mirrored, so no tree repeats), feathered
    x0, y0, x1, y1 = box
    piece = im.crop((x0 - dx, y0, x1 - dx, y1))
    if flip: piece = ImageOps.mirror(piece)
    mask = Image.new('L', piece.size, 0)
    ImageDraw.Draw(mask).rectangle((10, 10, piece.size[0] - 10, piece.size[1] - 10), fill=255)
    im.paste(piece, (x0, y0), mask.filter(ImageFilter.GaussianBlur(7)))
patch((440, 875, 790, 992), 330, True)   # the lattice, the post, the house, the tarp and the woodpile: the cypresses' and small pines' feet
patch((430, 995, 640, 1100), 230, True)  # the fire pit and its sand ring: lawn
c = im.crop((0, 300, 780, 1100))
c = ImageEnhance.Contrast(c).enhance(0.78); c = ImageEnhance.Color(c).enhance(0.8); c = ImageEnhance.Brightness(c).enhance(1.07)
c = c.filter(ImageFilter.GaussianBlur(2.2))   # out of focus, as distant trees are past a build in focus (Joey: "the trees are at a distance and super sharp, i think that feels off")
W, H0, EXT = c.width, c.height, 900
out = Image.new('RGB', (W, H0 + EXT)); out.paste(c, (0, 0))
base = c.crop((0, H0 - 40, W, H0)).resize((1, 1), Image.BOX).getpixel((0, 0))
for y in range(EXT):   # the lawn on below: its own colour, a little darker nearer, faded in from the photo's last rows
    k = 1 - 0.06 * (y / EXT)
    col = tuple(int(v * k) for v in base)
    out.paste(col, (0, H0 + y, W, H0 + y + 1))
blend = 90   # the photo's last lawn, mirrored down and faded into the plain colour: no seam, no streaks
tail = ImageOps.flip(c.crop((0, H0 - blend, W, H0)))
fade = Image.linear_gradient('L').resize((W, blend)).point(lambda v: v)   # 0 at the top (all photo) to 255 (all plain)
out.paste(Image.composite(Image.new('RGB', (W, blend), base), tail, fade), (0, H0))
# tileable across: its right edge cross-faded into its left over OV px, so it repeats with no seam and no mirror
OV = 150
A = out
T = A.crop((0, 0, A.width - OV, A.height))
ramp = Image.linear_gradient('L').rotate(90, expand=True).resize((OV, A.height))   # 255 at the left -> 0 at the right? (checked below)
left, right = A.crop((0, 0, OV, A.height)), A.crop((A.width - OV, 0, A.width, A.height))
T.paste(Image.composite(left, right, ramp), (0, 0))   # x=0 all of the right edge (continues the tile before), x=OV all of the left (continues itself)
out = T
out.save(dst, quality=86, method=6)
out.save(preview)
print(out.size, 'ground', 665 / out.height, 'ramp', ramp.getpixel((0, 0)), ramp.getpixel((OV - 1, 0)))
