"""Fila de narração: escolhe o próximo pedaço que cabe no limite grátis do mês.
Imprime 'livro|voz|capitulos' ou nada (quando não cabe nada ou está tudo pronto)."""
import json, os, glob, datetime, sys
LIMITE = 950000
fila = json.load(open('audio/fila.json'))
uso = json.load(open('audio/uso.json')) if os.path.exists('audio/uso.json') else {}
mes = datetime.date.today().strftime('%Y-%m')
sobra = LIMITE - uso.get(mes, {}).get('total', 0)
for item in fila:
    livro, voz = item['livro'], item['voz']
    if not os.path.exists(f'audio-src/{livro}.json'): continue
    book = json.load(open(f'audio-src/{livro}.json'))
    feitos = {int(os.path.basename(f)[:3]) for f in glob.glob(f'audio/{livro}/{voz}/*.mp3')}
    falta = [c for c in book['chapters'] if c['segs'] and c['i'] not in feitos]
    if not falta: continue
    caps, total = [], 0
    for c in falta:
        n = sum(len(s[2]) + 1 for s in c['segs'])
        if total + n > sobra: break
        caps.append(c['i']); total += n
    if caps: print(f"{livro}|{voz}|{','.join(map(str, caps))}")
    else: print(f'# não cabe mais nada este mês (sobra {sobra})', file=sys.stderr)
    break
