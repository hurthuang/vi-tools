"""以 music21 核對 js/theory.js：node tests/theory-cases.js > cases.json; python tests/theory_m21.py cases.json"""
import json, sys
from music21 import interval, note, chord, roman, key, pitch

data = json.load(open(sys.argv[1], encoding='utf-8'))
def P(s):
    return pitch.Pitch(s.replace('b', '-') if len(s) > 1 and s[1:2] in ('b',) or 'bb' in s else s)
def pit(s):
    # 'Bb4' 'C##3' 'Ebb4'
    step, rest = s[0], s[1:]
    acc = ''
    while rest and rest[0] in '#b':
        acc += rest[0]; rest = rest[1:]
    return pitch.Pitch(step + acc.replace('b', '-') + rest)

bad = 0
for c in data['intervals']:
    a, b = pit(c['a']), pit(c['b'])
    lo, hi = (a, b) if (a.diatonicNoteNum, a.ps) <= (b.diatonicNoteNum, b.ps) else (b, a)
    iv = interval.Interval(noteStart=note.Note(lo), noteEnd=note.Note(hi))
    mine = (c['quality'] or '?') + str(c['number'])
    if iv.name != mine or iv.semitones != c['semitones']:
        bad += 1
        if bad < 15: print('interval', c, iv.name, iv.semitones)
print('intervals checked', len(data['intervals']), 'bad', bad)

NAME = {'M': 'major triad', 'm': 'minor triad', 'd': 'diminished triad', 'A': 'augmented triad',
        'Mm7': 'dominant seventh chord', 'MM7': 'major seventh chord', 'mm7': 'minor seventh chord',
        'dm7': 'half-diminished seventh chord', 'dd7': 'diminished seventh chord'}
bad = 0
for c in data['chords']:
    ch = chord.Chord([pit(s) for s in c['notes']])
    m21root = ch.root().name.replace('-', 'b')
    exp = NAME.get(c['type'])
    ok = m21root == c['root'] and ch.inversion() == c['inversion'] and (exp is None or ch.commonName == exp)
    if not ok:
        bad += 1
        if bad < 15: print('chord', c, ch.commonName, m21root, ch.inversion())
print('chords checked', len(data['chords']), 'bad', bad)

bad = 0
for c in data['romans']:
    k = c['key']
    kk = key.Key(k[:-1].replace('b', '-').lower(), 'minor') if k.endswith('m') else key.Key(k.replace('b', '-'), 'major')
    ch = chord.Chord([pit(s) for s in c['notes']])
    rn = roman.romanNumeralFromChord(ch, kk)
    # music21 的級數寫法與臺灣課本不同（小調 VI 寫 bVI、V7 寫 V75#3），只比級數與轉位
    if (rn.scaleDegree, rn.inversion()) != (c['degree'], c['inversion']):
        bad += 1
        if bad < 25: print('roman', k, c['notes'], 'mine', c['symbol'], 'm21', rn.figure)
print('romans checked', len(data['romans']), 'bad', bad)
