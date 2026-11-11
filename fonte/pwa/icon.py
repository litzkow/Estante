# gera o ícone da Estante (lombadas numa prateleira, com brilho âmbar)
from PIL import Image, ImageDraw, ImageFilter
S = 2048
def make():
    im = Image.new('RGB', (S, S))
    d = ImageDraw.Draw(im)
    top, bot = (34, 30, 52), (12, 12, 16)
    for y in range(S):
        t = y / S
        d.line([(0, y), (S, y)], fill=tuple(int(top[i] * (1 - t) + bot[i] * t) for i in range(3)))
    glow = Image.new('L', (S, S), 0); ImageDraw.Draw(glow).ellipse([S*.18, S*.30, S*.82, S*.94], fill=120)
    glow = glow.filter(ImageFilter.GaussianBlur(S * .09))
    im = Image.composite(Image.new('RGB', (S, S), (232, 163, 61)), im, glow.point(lambda v: int(v * .55)))
    lay = Image.new('RGBA', (S, S), (0, 0, 0, 0)); d = ImageDraw.Draw(lay)
    u = S / 120
    shelf = 92
    books = [(27, 30, 15, (232, 163, 61)), (45, 20, 15, (246, 236, 214)), (63, 36, 13, (217, 105, 74))]
    for x, y, w, c in books:
        d.rounded_rectangle([x*u, y*u, (x+w)*u, shelf*u], radius=2.6*u, fill=c + (255,))
        dk = tuple(int(v * .72) for v in c) + (255,)
        d.rectangle([x*u, (y+7)*u, (x+w)*u, (y+9.2)*u], fill=dk)
        d.rectangle([x*u, (shelf-11)*u, (x+w)*u, (shelf-8.8)*u], fill=dk)
    # livro inclinado
    b = Image.new('RGBA', (int(13*u), int(56*u)), (0, 0, 0, 0)); bd = ImageDraw.Draw(b)
    bd.rounded_rectangle([0, 0, 13*u-1, 56*u-1], radius=2.6*u, fill=(122, 166, 201, 255))
    bd.rectangle([0, 7*u, 13*u, 9.2*u], fill=(88, 120, 146, 255))
    b = b.rotate(-17, expand=True, resample=Image.BICUBIC)
    lay.alpha_composite(b, (int(80*u), int(shelf*u - b.height + 1.2*u)))
    d.rounded_rectangle([18*u, shelf*u, 102*u, (shelf+4)*u], radius=2*u, fill=(246, 236, 214, 235))
    sh = lay.split()[3].filter(ImageFilter.GaussianBlur(S*.012)).point(lambda v: int(v*.5))
    im.paste((0, 0, 0), (0, int(S*.01)), sh)
    im = Image.alpha_composite(im.convert('RGBA'), lay).convert('RGB')
    return im
im = make()
for n, s in [('icon-512.png', 512), ('icon-180.png', 180)]:
    im.resize((s, s), Image.LANCZOS).save('dist/lib/' + n)
m = Image.new('RGB', (512, 512), (20, 19, 28)); m.paste(im.resize((400, 400), Image.LANCZOS), (56, 56)); m.save('dist/lib/icon-512-mask.png')
