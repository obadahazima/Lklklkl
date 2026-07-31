import sys
from pathlib import Path
repo = Path(r"C:\Users\obhaz\Lklklkl")
src = Path(r"C:\Users\obhaz\AppData\Local\Temp\copilot-image-ce6731.png")
ts = sys.argv[1] if len(sys.argv)>1 else 'backup'
backup = repo / 'artifacts' / f'icon-backups-{ts}'

# Ensure Pillow
try:
    from PIL import Image
except Exception:
    import subprocess, sys
    subprocess.check_call([sys.executable, '-m', 'pip', 'install', '--upgrade', 'pip'])
    subprocess.check_call([sys.executable, '-m', 'pip', 'install', 'Pillow'])
    from PIL import Image

if not src.exists():
    print('Source image not found:', src)
    sys.exit(1)

# Files to replace (found earlier)
replacements = {
    repo / 'artifacts' / 'finance-mobile' / 'assets' / 'icon.png': 1024,
    repo / 'artifacts' / 'finance-mobile' / 'assets' / 'images' / 'icon.png': 512,
    repo / 'artifacts' / 'finance-mobile' / 'assets' / 'images' / 'splash-icon.png': 1024,
    repo / 'artifacts' / 'finance-app' / 'public' / 'logo.png': 512,
    repo / 'artifacts' / 'finance-app' / 'public' / 'favicon.ico': None,
    repo / 'artifacts' / 'finance-app' / 'public' / 'favicon.svg': None,
}

# create backup dir
backup.mkdir(parents=True, exist_ok=True)

# copy originals to backup (move)
import shutil
for p in list(replacements.keys()):
    try:
        if p.exists():
            dest = backup / (p.name + '.bak')
            shutil.copy2(p, dest)
            print('Backed up', p, '->', dest)
    except Exception as e:
        print('Backup error for', p, e)

# open source image
img = Image.open(src).convert('RGBA')
# trim whitespace (near-white) around image
width, height = img.size
mask = Image.new('1', img.size)
mask_px = mask.load()
for y in range(height):
    for x in range(width):
        r,g,b,a = img.getpixel((x,y))
        if not (r>250 and g>250 and b>250):
            mask_px[x,y] = 1
bbox = mask.getbbox()
if bbox:
    img = img.crop(bbox)

# center-crop to square
w,h = img.size
s = min(w,h)
left = (w-s)//2
top = (h-s)//2
img = img.crop((left, top, left+s, top+s))
# remove very light background
datas = img.getdata()
newData = []
for item in datas:
    r,g,b,a = item
    if r>245 and g>245 and b>245:
        newData.append((255,255,255,0))
    else:
        newData.append((r,g,b,a))
img.putdata(newData)

pad_ratio = 0.08

def make_icon(size):
    inner = int(size * (1 - 2*pad_ratio))
    im = img.resize((inner, inner), Image.LANCZOS)
    out = Image.new('RGBA', (size, size), (255,255,255,0))
    offset = ((size - inner)//2, (size - inner)//2)
    out.paste(im, offset, im)
    return out

for p,sz in replacements.items():
    try:
        if sz is None:
            if p.suffix == '.ico':
                icons = [make_icon(16), make_icon(32), make_icon(48)]
                p.parent.mkdir(parents=True, exist_ok=True)
                icons[0].save(p, format='ICO', sizes=[(16,16),(32,32),(48,48)])
                print('Saved', p)
            elif p.suffix == '.svg':
                png = make_icon(512)
                import io, base64
                buf = io.BytesIO()
                png.save(buf, format='PNG')
                b64 = base64.b64encode(buf.getvalue()).decode('ascii')
                svg = f"""<svg xmlns='http://www.w3.org/2000/svg' width='512' height='512'><image href='data:image/png;base64,{b64}' width='512' height='512'/></svg>"""
                p.parent.mkdir(parents=True, exist_ok=True)
                p.write_text(svg, encoding='utf-8')
                print('Saved', p)
        else:
            out = make_icon(sz)
            p.parent.mkdir(parents=True, exist_ok=True)
            out.save(p, format='PNG')
            print('Saved', p)
    except Exception as e:
        print('Error saving', p, e)

print('Done')
