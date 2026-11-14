"""Gera o audiolivro de um livro da Estante.
Entrada: JSON exportado pelo próprio app (capítulos e trechos, exatamente como o app mostra o texto).
Saída: um MP3 por capítulo + mapa.json com o tempo de cada trecho (para o texto acompanhar o áudio).
Uso: python gerar.py fonte.json saida/ voz [parte de-partes]"""
import json, sys, os, re, numpy as np, lameenc
from kokoro_onnx import Kokoro

src, out, voice = sys.argv[1], sys.argv[2], sys.argv[3]
part, parts = (int(sys.argv[4]), int(sys.argv[5])) if len(sys.argv) > 5 else (0, 1)
book = json.load(open(src))
lang = 'pt-br' if voice[0] == 'p' else ('en-gb' if voice[0] == 'b' else 'en-us')
k = Kokoro(os.environ.get('KOKORO_MODEL', 'kokoro-v1.0.onnx'), os.environ.get('KOKORO_VOICES', 'voices-v1.0.bin'))
SR = 24000
os.makedirs(out, exist_ok=True)

def chunks(segs):
    # junta frases vizinhas até ~280 caracteres, sem atravessar parágrafos longos
    cur = None
    for i, (s, e, t, _l) in enumerate(segs):
        if cur and len(cur['t']) + len(t) < 280 and s - cur['e'] < 4:
            cur['t'] += ' ' + t; cur['e'] = e; cur['segs'].append(i)
        else:
            if cur: yield cur
            cur = {'s': s, 'e': e, 't': t, 'segs': [i]}
    if cur: yield cur

def say(text):
    text = re.sub(r'\s+', ' ', text).strip()
    if not re.search(r'\w', text): return np.zeros(0, np.float32)
    a, sr = k.create(text, voice=voice, speed=1.0, lang=lang)
    return np.asarray(a, np.float32)

for ch in book['chapters']:
    if ch['i'] % parts != part: continue
    segs = ch['segs']
    if not segs: continue
    audio, times, t0 = [], [], 0.0
    prev_e = None
    for c in chunks(segs):
        # pausa: maior entre parágrafos, menor entre frases
        gap = 0.0 if prev_e is None else (0.55 if c['s'] - prev_e >= 1 else 0.22)
        if gap: audio.append(np.zeros(int(SR * gap), np.float32)); t0 += gap
        a = say(c['t']); dur = len(a) / SR
        total = sum(len(segs[i][2]) for i in c['segs']) or 1; acc = 0
        for i in c['segs']:
            times.append([round(t0 + dur * acc / total, 2), i]); acc += len(segs[i][2])
        audio.append(a); t0 += dur; prev_e = c['e']
    pcm = np.concatenate(audio) if audio else np.zeros(SR, np.float32)
    pcm = np.clip(pcm / max(1e-3, float(np.abs(pcm).max())) * 0.9, -1, 1)
    enc = lameenc.Encoder(); enc.set_bit_rate(40); enc.set_in_sample_rate(SR); enc.set_channels(1); enc.set_quality(2)
    mp3 = enc.encode((pcm * 32767).astype(np.int16).tobytes()) + enc.flush()
    name = '%03d.mp3' % ch['i']
    open(os.path.join(out, name), 'wb').write(mp3)
    json.dump({'i': ch['i'], 'file': name, 'dur': round(len(pcm) / SR, 2), 'len': ch['len'], 'times': times}, open(os.path.join(out, '%03d.json' % ch['i']), 'w'))
    print('capítulo', ch['i'], round(len(pcm) / SR / 60, 1), 'min', flush=True)
