from pathlib import Path
from PIL import Image
repo = Path(r"C:\Users\obhaz\Lklklkl")
src = repo / 'artifacts' / 'finance-app' / 'public' / 'logo.png'
if not src.exists():
    print('Source logo.png not found at', src)
    raise SystemExit(1)
img = Image.open(src).convert('RGBA')
px = img.load()
w,h = img.size
# compute mask for white (B) and sample green color
white_mask = [[False]*h for _ in range(w)]
green_pixels = []
for y in range(h):
    for x in range(w):
        r,g,b,a = px[x,y]
        if a==0:
            continue
        if r>200 and g>200 and b>200:
            white_mask[x][y] = True
        if g>r and g>b and a>0:
            green_pixels.append((r,g,b))
# average green
if green_pixels:
    gr = sum(p[0] for p in green_pixels)//len(green_pixels)
    gg = sum(p[1] for p in green_pixels)//len(green_pixels)
    gb = sum(p[2] for p in green_pixels)//len(green_pixels)
else:
    gr,gg,gb = (18,118,87)  # fallback teal

out = Image.new('RGBA', (w,h), (255,255,255,0))
out_px = out.load()
for y in range(h):
    for x in range(w):
        if white_mask[x][y]:
            out_px[x,y] = (gr,gg,gb,255)
        else:
            out_px[x,y] = (255,255,255,0)

target = repo / 'artifacts' / 'finance-app' / 'public' / 'logo-symbol.png'
out.save(target, format='PNG')
print('Saved', target)
# save smaller sizes
for size in (128,64,32):
    im = out.resize((size,size), Image.LANCZOS)
    targ = target.with_name(f'logo-symbol-{size}.png')
    im.save(targ, format='PNG')
    print('Saved', targ)
print('Done')
