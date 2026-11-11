#!/bin/bash
set -e
cd /home/claude/estante
./build.sh >/dev/null
rm -rf site && mkdir -p site/lib
B=$(date +%Y%m%d%H%M)
sed 's#<link rel="apple-touch-icon" href="lib/icon-180.png">#<link rel="apple-touch-icon" href="lib/icon-180.png">\n<link rel="manifest" href="manifest.webmanifest">#' dist/index.html > site/index.html
sed "s/__BUILD__/$B/" pwa/sw.js > site/sw.js
cp pwa/manifest.webmanifest site/
cp dist/lib/icon-180.png dist/lib/icon-512.png dist/lib/icon-512-mask.png site/lib/
python3 -c "from PIL import Image;Image.open('dist/lib/icon-512.png').resize((192,192),Image.LANCZOS).save('site/lib/icon-192.png')"
touch site/.nojekyll
cat > site/README.md <<'R'
# Estante

Leitor de HQs e livros (CBZ, PDF, EPUB, TXT) que funciona no celular e no tablet, inclusive sem internet.
Os livros ficam guardados só no aparelho de quem usa.
R
grep -c 'rel="manifest"' site/index.html; ls -la site site/lib
# livros grátis que o app adiciona sozinho
mkdir -p site/livros && cp /home/claude/obras/out/*.epub /home/claude/obras/out/*.cbz site/livros/
python3 - <<'PY'
import zipfile, re, os, json, html
d='/home/claude/estante/site/livros'; out=[]
for f in os.listdir(d):
    p=os.path.join(d,f); sz=os.path.getsize(p); t=f.rsplit('.',1)[0].replace('-',' ')
    if f.endswith('.epub'):
        z=zipfile.ZipFile(p); opf=[n for n in z.namelist() if n.endswith('.opf')][0]; m=re.search(r'<dc:title[^>]*>(.*?)</dc:title>', z.read(opf).decode('utf-8','ignore'), re.S)
        if m: t=html.unescape(m.group(1).strip())
    out.append({'file':f,'title':t,'size':sz,'big':sz>5_000_000})
out.sort(key=lambda x:x['size'])
json.dump(out, open(os.path.join(d,'catalogo.json'),'w'), ensure_ascii=False, indent=1)
print(len(out),'livros no catálogo')
PY
