# capas com a arte original de cada livro, centralizadas em 2:3
import asyncio, zipfile, base64, io, os, re
from PIL import Image, ImageChops, ImageStat
from playwright.async_api import async_playwright
O='/home/claude/obras/capas/'; SRC='/home/claude/obras/src/'
W,H=600,900
def scan(path, out):
    im=Image.open(path).convert('RGB')
    w,h=im.size; e=max(4,int(min(w,h)*.02))
    strips=[im.crop((0,0,w,e)),im.crop((0,h-e,w,h)),im.crop((0,0,e,h)),im.crop((w-e,0,w,h))]
    bg=tuple(int(sum(ImageStat.Stat(s).median[i] for s in strips)/4) for i in range(3))
    diff=ImageChops.difference(im, Image.new('RGB',im.size,bg)).convert('L').point(lambda v:255 if v>48 else 0)
    bb=diff.getbbox() or (0,0,w,h)
    pw,ph=int((bb[2]-bb[0])*.10),int((bb[3]-bb[1])*.07)
    im=im.crop((max(0,bb[0]-pw),max(0,bb[1]-ph),min(w,bb[2]+pw),min(h,bb[3]+ph)))
    s=min(W*.9/im.width,H*.9/im.height); im=im.resize((int(im.width*s),int(im.height*s)),Image.LANCZOS)
    c=Image.new('RGB',(W,H),bg); c.paste(im,((W-im.width)//2,(H-im.height)//2)); c.save(out,quality=90)
def full(path,out):
    im=Image.open(path).convert('RGB'); s=max(W/im.width,H/im.height)
    im=im.resize((round(im.width*s),round(im.height*s)),Image.LANCZOS)
    x,y=(im.width-W)//2,(im.height-H)//2; im.crop((x,y,x+W,y+H)).save(out,quality=90)
scan(SRC+'Dom-Casmurro_55752/55752-h/images/cover02.jpg',O+'Dom-Casmurro.jpg')
full(SRC+'Iracema-com-uma-noticia-biographica-do-auctor_67740/67740-h/images/iracema_frontispiece.jpg',O+'Iracema.jpg')
scan(SRC+'O-Cortico_69187/69187-h/images/cortico_cover.jpg',O+'O-Cortico.jpg')
scan(SRC+'Quincas-Borba_55682/55682-h/images/cover.jpg',O+'Quincas-Borba.jpg')
scan(SRC+'Memorias-Posthumas-de-Braz-Cubas_54829/54829-h/images/cover.jpg',O+'Memorias-Postumas-de-Bras-Cubas.jpg')
# pinturas com título no estilo Standard Ebooks
PAINT={'Os-Lusiadas':('/tmp/lus/images/cover.jpg','Os Lusíadas','Luís Vaz de Camões'),
       'A-Maquina-do-Tempo':(SRC+'h-g-wells_the-time-machine/images/cover.jpg','A Máquina do Tempo','H. G. Wells')}
SE=['Alices-Adventures-in-Wonderland','Don-Quixote','Dracula','Frankenstein','Grimms-Fairy-Tales','Tarzan-of-the-Apes','The-Time-Machine']
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path='/usr/bin/google-chrome'); pg=await b.new_page(viewport={'width':W,'height':H})
        for k,(img,t,a) in PAINT.items():
            d=base64.b64encode(open(img,'rb').read()).decode()
            await pg.set_content(f'''<html><body style="margin:0"><div style="width:{W}px;height:{H}px;background:url(data:image/jpeg;base64,{d}) center/cover;position:relative">
<div style="position:absolute;left:0;right:0;bottom:70px;background:rgba(0,0,0,.75);padding:22px 20px 20px;text-align:center;color:#fff;font-family:'Inter Display';text-transform:uppercase">
<div style="font-weight:800;font-size:{40 if len(t)<14 else 34}px;letter-spacing:1.5px;line-height:1.05">{t}</div><div style="font-weight:700;font-size:17px;letter-spacing:2px;margin-top:10px">{a}</div></div></div></body></html>''')
            await pg.wait_for_timeout(300); await pg.screenshot(path=O+k+'.jpg',type='jpeg',quality=90)
        for k in SE:
            z=zipfile.ZipFile('/home/claude/obras/out/'+k+'.epub'); n=[x for x in z.namelist() if x.endswith('images/cover.svg')][0]
            s=z.read(n).decode()
            await pg.set_content(f'<html><body style="margin:0">{s.split("?>",1)[-1].replace("<svg ",f"<svg width=\"{W}\" height=\"{H}\" ",1)}</body></html>')
            await pg.wait_for_timeout(300); await pg.screenshot(path=O+k+'.jpg',type='jpeg',quality=90)
        await b.close()
asyncio.run(main())
print(sorted(os.listdir(O)))
