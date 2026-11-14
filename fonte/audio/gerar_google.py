"""Narra um livro da Estante com as vozes do Google (Chirp 3 HD).
Mesmo formato de saída do gerar.py: um MP3 por capítulo + o tempo de cada trecho.
Uso: python gerar_google.py fonte.json saida/ NOME_DA_VOZ [parte partes]   (chave em GOOGLE_TTS_KEY)"""
import json, sys, os, re, time, base64, urllib.request, urllib.error, numpy as np, lameenc

src, out, voice = sys.argv[1], sys.argv[2], sys.argv[3]
part, parts = (int(sys.argv[4]), int(sys.argv[5])) if len(sys.argv) > 5 else (0, 1)
KEY = os.environ['GOOGLE_TTS_KEY']
lang = '-'.join(voice.split('-')[:2])
# vozes Gemini (pagas, mais expressivas): pt-BR-GeminiFlash-Enceladus / pt-BR-GeminiPro-Enceladus
GEMINI = {'GeminiFlash': 'gemini-2.5-flash-tts', 'GeminiPro': 'gemini-2.5-pro-tts'}
gm = next((m for k, m in GEMINI.items() if f'-{k}-' in voice), None)
vname = voice.split('-')[-1] if gm else voice
ESTILO = {
    'pt': 'Narre como um narrador profissional de audiolivro brasileiro: voz calorosa e envolvente, ritmo calmo, entonação natural, '
          'emoção nas falas dos personagens, pausas naturais nas vírgulas e entre as frases. Leia exatamente o texto, sem acrescentar nada.',
    'en': 'Narrate like a professional audiobook narrator: warm, engaging voice, calm pace, natural intonation, '
          'expressive character dialogue, natural pauses. Read the text exactly as written.',
}
SR = 24000
book = json.load(open(src))
CAPS = set(int(x) for x in os.environ.get('CAPS', '').split(',') if x.strip())  # só estes capítulos (vazio = todos)
os.makedirs(out, exist_ok=True)

GKEY = os.environ.get('GEMINI_KEY', '')
GMODEL = {'gemini-2.5-flash-tts': ['gemini-2.5-flash-preview-tts', 'gemini-2.5-flash-tts'], 'gemini-2.5-pro-tts': ['gemini-2.5-pro-preview-tts', 'gemini-2.5-pro-tts']}

def tts_gemini(text):
    # API do Gemini (AI Studio): devolve áudio PCM 16 bits, 24 kHz
    body = json.dumps({'contents': [{'parts': [{'text': ESTILO.get(lang[:2], ESTILO['en']) + '\n\n' + text}]}],
                       'generationConfig': {'responseModalities': ['AUDIO'],
                                            'speechConfig': {'voiceConfig': {'prebuiltVoiceConfig': {'voiceName': vname}}}}}).encode()
    last = ''
    for model in GMODEL[gm]:
        for k in range(8):
            try:
                req = urllib.request.Request(f'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={GKEY}', body, {'Content-Type': 'application/json'})
                j = json.load(urllib.request.urlopen(req, timeout=300))
                part = j['candidates'][0]['content']['parts'][0]['inlineData']
                return np.frombuffer(base64.b64decode(part['data']), np.int16).astype(np.float32) / 32768
            except urllib.error.HTTPError as e:
                last = e.read().decode('utf8', 'ignore')[:300]
                if e.code == 404: break
                if e.code in (429, 500, 503) and k < 7: time.sleep(10 * (k + 1)); continue
                sys.exit('Gemini recusou (%s): %s' % (e.code, last))
            except (KeyError, IndexError):
                if k < 7: time.sleep(5); continue
                raise
            except Exception:
                if k < 7: time.sleep(5 * (k + 1)); continue
                raise
    sys.exit('Gemini: modelo não encontrado. ' + last)

def tts(text):
    if gm and GKEY: return tts_gemini(text)
    inp = {'text': text, 'prompt': ESTILO.get(lang[:2], ESTILO['en'])} if gm else {'text': text}
    vo = {'languageCode': lang, 'name': vname, 'modelName': gm} if gm else {'languageCode': lang, 'name': voice}
    body = json.dumps({'input': inp, 'voice': vo,
                       'audioConfig': {'audioEncoding': 'LINEAR16', 'sampleRateHertz': SR}}).encode()
    for k in range(8):
        try:
            req = urllib.request.Request('https://texttospeech.googleapis.com/v1/text:synthesize?key=' + KEY, body, {'Content-Type': 'application/json'})
            wav = base64.b64decode(json.load(urllib.request.urlopen(req, timeout=120))['audioContent'])
            i = wav.find(b'data')
            return np.frombuffer(wav[i + 8:] if i >= 0 else wav[44:], np.int16).astype(np.float32) / 32768
        except urllib.error.HTTPError as e:
            msg = e.read().decode('utf8', 'ignore')[:300]
            if e.code == 400 and 'too long' in msg: return None  # frase longa demais: quem chamou divide
            if e.code in (429, 500, 503) and k < 7: time.sleep(8 * (k + 1)); continue
            sys.exit('Google recusou (%s): %s' % (e.code, msg))
        except Exception as e:
            if k < 7: time.sleep(5 * (k + 1)); continue
            raise

def pieces(text, size):
    # divide nas vírgulas, ponto e vírgula e travessões; em último caso, nos espaços
    out, cur = [], ''
    for part in re.split(r'(?<=[,;:—–])\s+|\n\n', text):
        if len(cur) + len(part) + 1 <= size: cur = (cur + ' ' + part).strip()
        else:
            if cur: out.append(cur)
            while len(part) > size:
                cut = part.rfind(' ', 0, size); cut = cut if cut > 40 else size
                out.append(part[:cut]); part = part[cut:].strip()
            cur = part
    if cur: out.append(cur)
    return out

def say(text, depth=0):
    a = tts(text)
    if a is not None: return a
    if depth >= 3: return np.zeros(int(SR * 0.2), np.float32)
    size = [400, 200, 120][depth]
    parts = [say(p, depth + 1) for p in pieces(text, size) if re.search(r'\w', p)]
    gap = np.zeros(int(SR * 0.12), np.float32)
    out = []
    for i, p in enumerate(parts): out += ([gap] if i else []) + [p]
    return np.concatenate(out) if out else np.zeros(int(SR * 0.2), np.float32)

def heading_text(t):
    # "— CAPÍTULO UM —" → "Capítulo um."  (tudo em maiúsculas soa como sigla; o ponto dá a entonação de título)
    t = re.sub(r'^[\s—–\-·*]+|[\s—–\-·*]+$', '', t).strip()
    letters = [c for c in t if c.isalpha()]
    if letters and sum(c.isupper() for c in letters) / len(letters) > 0.8: t = t[:1].upper() + t[1:].lower()
    return t if re.search(r'[.!?…:]$', t) else t + '.'

def chunks(segs):
    # um parágrafo por vez (até ~1400 caracteres); títulos sempre sozinhos, com pausa antes e depois
    cur = None
    for i, sg in enumerate(segs):
        s, e, t = sg[0], sg[1], sg[2]
        blk = sg[4] if len(sg) > 4 else None
        head = bool(sg[5]) if len(sg) > 5 else False
        if head: t = heading_text(t)
        same = cur is not None and blk is not None and cur['blk'] == blk and not head and not cur['head']
        if same and len(cur['t']) + len(t) < 1400:
            cur['t'] += ' ' + t; cur['e'] = e; cur['segs'].append(i)
        else:
            if cur: yield cur
            cur = {'s': s, 'e': e, 't': t, 'segs': [i], 'blk': blk, 'head': head, 'cont': same}
    if cur: yield cur

for ch in book['chapters']:
    if ch['i'] % parts != part or not ch['segs'] or (CAPS and ch['i'] not in CAPS): continue
    segs = ch['segs']; audio, times, t0 = [], [], 0.0
    prev = None
    for n, c in enumerate(chunks(segs)):
        if n:
            # pausas de narrador: título 1,1 s; entre parágrafos 0,7 s; parágrafo longo continuando 0,3 s
            gap = 1.1 if (c['head'] or prev['head']) else (0.3 if c['cont'] else 0.7)
            audio.append(np.zeros(int(SR * gap), np.float32)); t0 += gap
        prev = c
        if not re.search(r'\w', c['t']): continue
        a = say(c['t']); dur = len(a) / SR
        total = sum(len(segs[i][2]) for i in c['segs']) or 1; acc = 0
        for i in c['segs']:
            times.append([round(t0 + dur * acc / total, 2), i]); acc += len(segs[i][2])
        audio.append(a); t0 += dur
    pcm = np.concatenate(audio) if audio else np.zeros(SR, np.float32)
    enc = lameenc.Encoder(); enc.set_bit_rate(48); enc.set_in_sample_rate(SR); enc.set_channels(1); enc.set_quality(2)
    mp3 = enc.encode((np.clip(pcm, -1, 1) * 32767).astype(np.int16).tobytes()) + enc.flush()
    name = '%03d.mp3' % ch['i']
    open(os.path.join(out, name), 'wb').write(mp3)
    json.dump({'ver': 2, 'i': ch['i'], 'file': name, 'dur': round(len(pcm) / SR, 2), 'len': ch['len'], 'times': times}, open(os.path.join(out, '%03d.json' % ch['i']), 'w'))
    print('capítulo', ch['i'], round(len(pcm) / SR / 60, 1), 'min', flush=True)
