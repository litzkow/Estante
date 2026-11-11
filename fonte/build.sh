#!/bin/bash
set -e
cd /home/claude/estante
{
cat <<'H'
<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
<meta name="theme-color" content="#141518">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Estante">
<link rel="apple-touch-icon" href="lib/icon-180.png">
<link rel="icon" href="lib/icon-180.png">
<title>Estante</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:ital,wght@0,400;0,700;1,400;1,700&family=Inter:wght@400;500;600;700&family=Literata:ital,opsz,wght@0,7..72,400;0,7..72,600;0,7..72,700;1,7..72,400&display=swap">
<style>
H
cat src/style.css
echo '</style>'
echo '<script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"></script>'
echo '</head>'
echo '<body class="t-escuro">'
cat src/body.html
echo '<script>'
cat src/01-util.js src/02-i18n.js src/03-store.js src/04-formats.js src/05-lib.js src/06-comic.js src/07-book.js src/08-pdf.js src/09-main.js src/10-design.js src/11-tts.js
echo '</script>'
echo '</body></html>'
} > dist/index.html
sed -n "/^<script>$/,/^<\/script>$/p" dist/index.html | sed "1d;\$d" > /tmp/app_check.js && node --check /tmp/app_check.js && echo "JS OK"
wc -c dist/index.html
