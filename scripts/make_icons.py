"""Draws the CMU Database launcher icon, adaptive icon layers, notification icon and splash screens (run once; output is committed)."""
import os, math, sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter

OUT = sys.argv[1] if len(sys.argv) > 1 else 'android-res'
NAVY, NAVY_DK, ORANGE, GREEN, WHITE = (31, 78, 120), (18, 46, 74), (217, 119, 87), (112, 173, 71), (255, 255, 255)

def font(size, bold=True):
    for p in ['/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', '/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf']:
        if os.path.exists(p): return ImageFont.truetype(p, size)
    return ImageFont.load_default()

def gradient(size, c1, c2):
    im = Image.new('RGB', (size, size), c1)
    d = ImageDraw.Draw(im)
    for y in range(size):
        t = y / size
        d.line([(0, y), (size, y)], fill=tuple(int(c1[i] + (c2[i] - c1[i]) * t) for i in range(3)))
    return im

def flask(d, cx, cy, s, body=WHITE, liquid=ORANGE, mono=False):
    """Erlenmeyer flask centred at (cx, cy); s = overall height."""
    nw, nh = s * 0.20, s * 0.34           # neck
    bw = s * 0.78                         # base width
    top = cy - s / 2; neck_bot = top + nh; bot = cy + s / 2
    r = s * 0.06
    # outline polygon
    pts = [(cx - nw / 2, top + s * 0.05), (cx - nw / 2, neck_bot), (cx - bw / 2, bot - r), (cx - bw / 2 + r, bot),
           (cx + bw / 2 - r, bot), (cx + bw / 2, bot - r), (cx + nw / 2, neck_bot), (cx + nw / 2, top + s * 0.05)]
    d.polygon(pts, fill=body)
    # rim
    d.rounded_rectangle([cx - nw / 2 - s * 0.06, top, cx + nw / 2 + s * 0.06, top + s * 0.08], radius=s * 0.03, fill=body)
    if mono: return
    # liquid: lower part of the cone
    ly = neck_bot + (bot - neck_bot) * 0.42
    def xat(y):  # half width of the cone at y
        return nw / 2 + (bw / 2 - nw / 2) * (y - neck_bot) / (bot - r - neck_bot)
    m = s * 0.035
    lp = [(cx - xat(ly) + m, ly), (cx - bw / 2 + m * 1.2, bot - r - m * 0.3), (cx - bw / 2 + r + m, bot - m), (cx + bw / 2 - r - m, bot - m),
          (cx + bw / 2 - m * 1.2, bot - r - m * 0.3), (cx + xat(ly) - m, ly)]
    d.polygon(lp, fill=liquid)
    # bubbles
    for (dx, dy, rr) in [(-0.12, 0.30, 0.035), (0.08, 0.36, 0.05), (0.16, 0.25, 0.025)]:
        x, y, rad = cx + dx * s, cy + dy * s, rr * s
        d.ellipse([x - rad, y - rad, x + rad, y + rad], fill=(255, 220, 205))

def launcher(size):
    S = 1024
    im = gradient(S, NAVY, NAVY_DK)
    d = ImageDraw.Draw(im)
    flask(d, S / 2, S * 0.43, S * 0.50)
    f = font(int(S * 0.15))
    t = 'CMU'; w = d.textlength(t, font=f)
    d.text(((S - w) / 2, S * 0.71), t, font=f, fill=WHITE)
    d.rectangle([S * 0.30, S * 0.895, S * 0.70, S * 0.91], fill=GREEN)
    mask = Image.new('L', (S, S), 0); ImageDraw.Draw(mask).rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * 0.22), fill=255)
    out = Image.new('RGBA', (S, S)); out.paste(im, (0, 0), mask)
    return out.resize((size, size), Image.LANCZOS)

def launcher_round(size):
    S = 1024
    im = launcher(S)
    mask = Image.new('L', (S, S), 0); ImageDraw.Draw(mask).ellipse([0, 0, S - 1, S - 1], fill=255)
    bg = gradient(S, NAVY, NAVY_DK).convert('RGBA')
    bg.paste(im, (0, 0), im)
    out = Image.new('RGBA', (S, S)); out.paste(bg, (0, 0), mask)
    return out.resize((size, size), Image.LANCZOS)

def foreground(size):
    """adaptive icon foreground: 108dp canvas, art inside the 66dp safe zone"""
    S = 1080
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    flask(d, S / 2, S * 0.45, S * 0.36)
    f = font(int(S * 0.10)); t = 'CMU'; w = d.textlength(t, font=f)
    d.text(((S - w) / 2, S * 0.645), t, font=f, fill=WHITE)
    return im.resize((size, size), Image.LANCZOS)

def notif(size):
    S = 512
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    flask(d, S / 2, S / 2, S * 0.86, body=WHITE, mono=True)
    return im.resize((size, size), Image.LANCZOS)

def splash(w, h):
    im = gradient(max(w, h), NAVY, NAVY_DK).resize((w, h))
    d = ImageDraw.Draw(im)
    s = min(w, h) * 0.30
    flask(d, w / 2, h / 2 - s * 0.25, s)
    f = font(int(s * 0.22)); t = 'CMU Database'; tw = d.textlength(t, font=f)
    d.text(((w - tw) / 2, h / 2 + s * 0.42), t, font=f, fill=WHITE)
    f2 = font(int(s * 0.09)); t2 = 'EPA LIBERIA  ·  ERRS  ·  CHEMICAL MANAGEMENT UNIT'; tw2 = d.textlength(t2, font=f2)
    d.text(((w - tw2) / 2, h / 2 + s * 0.75), t2, font=f2, fill=(155, 194, 230))
    return im

dens = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}
for k, m in dens.items():
    p = os.path.join(OUT, 'mipmap-' + k); os.makedirs(p, exist_ok=True)
    launcher(int(48 * m)).save(os.path.join(p, 'ic_launcher.png'))
    launcher_round(int(48 * m)).save(os.path.join(p, 'ic_launcher_round.png'))
    foreground(int(108 * m)).save(os.path.join(p, 'ic_launcher_foreground.png'))
    q = os.path.join(OUT, 'drawable-' + k); os.makedirs(q, exist_ok=True)
    notif(int(24 * m)).save(os.path.join(q, 'ic_stat_cmu.png'))
splashes = {'drawable': (480, 320), 'drawable-land-mdpi': (480, 320), 'drawable-land-hdpi': (800, 480), 'drawable-land-xhdpi': (1280, 720),
            'drawable-land-xxhdpi': (1600, 960), 'drawable-land-xxxhdpi': (1920, 1280), 'drawable-port-mdpi': (320, 480), 'drawable-port-hdpi': (480, 800),
            'drawable-port-xhdpi': (720, 1280), 'drawable-port-xxhdpi': (960, 1600), 'drawable-port-xxxhdpi': (1280, 1920)}
for k, (w, h) in splashes.items():
    p = os.path.join(OUT, k); os.makedirs(p, exist_ok=True)
    splash(w, h).save(os.path.join(p, 'splash.png'))
os.makedirs(os.path.join(OUT, 'values'), exist_ok=True)
open(os.path.join(OUT, 'values', 'ic_launcher_background.xml'), 'w').write(
    '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#1F4E78</color>\n</resources>\n')
os.makedirs('public', exist_ok=True)
launcher(512).save('public/icon-512.png'); launcher(192).save('public/icon-192.png')
foreground(256).save('public/logo-mark.png')
print('icons written to', OUT)
