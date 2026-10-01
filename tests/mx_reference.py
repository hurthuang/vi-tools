"""
用 music21 讀取 MusicXML，輸出每個譜表、每個小節的音（起始時間、MIDI 音高、時值），
作為檢驗我們 MusicXML 匯入的參考答案。

用法：python tests/mx_reference.py <資料夾> <輸出.json>
只取第一個聲部（part）的前兩行譜表，與我們的匯入範圍相同；
略過倚音與隱藏的音符，時間單位為「每四分音符 960」。
"""
import json
import os
import sys
import warnings

warnings.filterwarnings('ignore')
from music21 import converter, stream, note, chord

TPQ = 960


PART = sys.argv[3] if len(sys.argv) > 3 else None  # 'piano'：第一個有兩行譜表的聲部


def staves_of_first_part(score):
    parts = list(score.parts)
    if not parts:
        return []
    first = parts[0]
    if PART == 'piano':
        groups = {}
        for p in parts:
            groups.setdefault((p.id or '').split('-Staff')[0], []).append(p)
        for g in groups.values():
            if len(g) >= 2 and all(isinstance(x, stream.PartStaff) for x in g):
                first = g[0]
                break
    pid = (first.id or '').split('-Staff')[0]
    same = [p for p in parts if isinstance(p, stream.PartStaff) and (p.id or '').split('-Staff')[0] == pid]
    return (same or [first])[:2]


def measure_notes(m):
    out = []
    for el in m.recurse().notes:
        if el.duration.isGrace or el.duration.quarterLength == 0:
            continue  # 倚音、和弦名稱、數字低音
        if getattr(el.style, 'hideObjectOnPrint', False):
            continue
        try:
            onset = el.getOffsetInHierarchy(m)
        except Exception:
            onset = el.offset
        dur = round(float(el.duration.quarterLength) * TPQ)
        on = round(float(onset) * TPQ)
        pitches = el.pitches if isinstance(el, chord.Chord) else ([el.pitch] if isinstance(el, note.Note) else [])
        for p in pitches:
            out.append('%d:%d:%d' % (on, round(p.ps), dur))
    return sorted(out)


def main():
    folder, outfile = sys.argv[1], sys.argv[2]
    result = {}
    for f in sorted(os.listdir(folder)):
        if not f.lower().endswith(('.xml', '.mxl', '.musicxml')):
            continue
        try:
            sc = converter.parse(os.path.join(folder, f), forceSource=True)
            staves = staves_of_first_part(sc)
            result[f] = [[measure_notes(m) for m in s.getElementsByClass(stream.Measure)] for s in staves]
        except Exception as e:  # noqa
            result[f] = {'error': str(e)[:200]}
    with open(outfile, 'w', encoding='utf-8') as fp:
        json.dump(result, fp, ensure_ascii=False)
    print('files:', len(result), '| music21 errors:', sum(1 for v in result.values() if isinstance(v, dict)))


main()
