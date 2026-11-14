"""Narra um livro da Estante com as vozes do Google (Chirp 3 HD).
Mesmo formato de saída do gerar.py: um MP3 por capítulo + o tempo de cada trecho.
Uso: python gerar_google.py fonte.json saida/ NOME_DA_VOZ [parte partes]   (chave em GOOGLE_TTS_KEY)"""
import json, sys, os, re, time, base64, urllib.request, urllib.error, numpy as np, lameenc

src, out, voice = sys.argv[1], sys.argv[2], sys.argv[3]
part, parts = (int(sys.argv[4]), int(sys.argv[5])) if len(sys.argv) > 5 else (0, 1)
KEY = os.environ['GOOGLE_TTS_KEY']
lang = '-'.join(voice.split('-')[:2])
SR = 24000
book = json.load(open(src))
os.makedirs(out, exist_ok=True)

def tts(text):
    body = json.dumps({'input': {'text': text}, 'voice': {'languageCode': lang, 'name': voice},
                       'audioConfig': {'audioEncoding': 'LINEAR16', 'sampleRateHertz': SR}}).encode()
    for k in range(8):
        try:
            req = urllib.request.Request('https://texttospeech.googleapis.com/v1/text:synthesize?key=' + KEY, body, {'Content-Type': 'application/json'})
            wav = base64.b64decode(json.load(urllib.request.urlopen(req, timeout=120))['audioContent'])
            i = wav.find(b'data')
            return np.frombuffer(wav[i + 8:] if i >= 0 else wav[44:], np.int16).astype(np.float32) / 32768
        except urllib.error.HTTPError as e:
            msg = e.read().decode('utf8', 'ignore')[:300]
            if e.code in (429, 500, 503) and k < 7: time.sleep(5 * (k + 1)); continue
            sys.exit('Google recusou (%s): %s' % (e.code, msg))
        except Exception as e:
            if k < 7: time.sleep(5 * (k + 1)); continue
            raise

def chunks(segs):
    # parágrafos inteiros juntos até ~1400 caracteres (a voz entende melhor o contexto)
    cur = None
    for i, (s, e, t, _l) in enumerate(segs):
        newpar = cur is not None and s - cur['e'] >= 1
        if cur and len(cur['t']) + len(t) < 1400:
            cur['t'] += ('\n\n' if newpar else ' ') + t; cur['e'] = e; cur['segs'].append(i)
        else:
            if cur: yield cur
            cur = {'s': s, 'e': e, 't': t, 'segs': [i]}
    if cur: yield cur

for ch in book['chapters']:
    if ch['i'] % parts != part or not ch['segs']: continue
    segs = ch['segs']; audio, times, t0 = [], [], 0.0
    for n, c in enumerate(chunks(segs)):
        if n: audio.append(np.zeros(int(SR * 0.45), np.float32)); t0 += 0.45
        if not re.search(r'\w', c['t']): continue
        a = tts(c['t']); dur = len(a) / SR
        total = sum(len(segs[i][2]) for i in c['segs']) or 1; acc = 0
        for i in c['segs']:
            times.append([round(t0 + dur * acc / total, 2), i]); acc += len(segs[i][2])
        audio.append(a); t0 += dur
    pcm = np.concatenate(audio) if audio else np.zeros(SR, np.float32)
    enc = lameenc.Encoder(); enc.set_bit_rate(48); enc.set_in_sample_rate(SR); enc.set_channels(1); enc.set_quality(2)
    mp3 = enc.encode((np.clip(pcm, -1, 1) * 32767).astype(np.int16).tobytes()) + enc.flush()
    name = '%03d.mp3' % ch['i']
    open(os.path.join(out, name), 'wb').write(mp3)
    json.dump({'i': ch['i'], 'file': name, 'dur': round(len(pcm) / SR, 2), 'len': ch['len'], 'times': times}, open(os.path.join(out, '%03d.json' % ch['i']), 'w'))
    print('capítulo', ch['i'], round(len(pcm) / SR / 60, 1), 'min', flush=True)
