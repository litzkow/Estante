#!/bin/bash
set -e
cd /home/claude/estante
./build.sh >/dev/null
rm -rf site && mkdir -p site/lib
B=$(date +%Y%m%d%H%M)
sed 's#<link rel="apple-touch-icon" href="lib/icon-180.png">#<link rel="apple-touch-icon" href="lib/icon-180.png">\n<link rel="manifest" href="manifest.webmanifest">#' dist/index.html > site/index.html
sed "s/__BUILD__/$B/" pwa/sw.js > site/sw.js
cp pwa/manifest.webmanifest site/
cp dist/lib/icon-180.png dist/lib/icon-512.png site/lib/
python3 - <<'PY'
from PIL import Image
im=Image.open('/home/claude/estante/dist/lib/icon-512.png')
im.resize((192,192),Image.LANCZOS).save('/home/claude/estante/site/lib/icon-192.png')
# maskable: content inside safe zone
m=Image.new('RGB',(512,512),(20,21,24)); s=im.resize((400,400),Image.LANCZOS); m.paste(s,(56,56)); m.save('/home/claude/estante/site/lib/icon-512-mask.png')
PY
touch site/.nojekyll
cat > site/README.md <<'R'
# Estante

Leitor de HQs e livros (CBZ, PDF, EPUB, TXT) que funciona no celular e no tablet, inclusive sem internet.
Os livros ficam guardados só no aparelho de quem usa.
R
grep -c 'rel="manifest"' site/index.html; ls -la site site/lib
