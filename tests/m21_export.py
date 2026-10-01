"""
從 music21 的點字測試（《Introduction to Braille Music Transcription》例題）
匯出每一組「樂譜（MusicXML）+ 預期點字」，供我們的轉換器比對。
"""
import copy
import json
import os
import sys
import unittest
import warnings

warnings.filterwarnings('ignore')
from music21 import stream
from music21.braille import test as T

OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)
records = []


def runB(self):
    if self.stream is None:
        return
    rec = {
        'id': len(records) + 1,
        'test': self._testMethodName,
        'method': self.method.__name__,
        'args': {k: v for k, v in self.methodArgs.items() if isinstance(v, (bool, int, str, float))},
        'expected': self.expectedBraille,
    }
    s = copy.deepcopy(self.stream)
    # music21 自己的輸出是否等於標準答案
    try:
        got = self.method(copy.deepcopy(self.stream), inPlace=True, **self.methodArgs)
        rec['m21ok'] = self._neutralizeSpacing(got) == self.expectedBraille
    except Exception as e:  # noqa
        rec['m21ok'] = False
        rec['m21error'] = str(e)
    files = []
    try:
        if rec['method'] == 'keyboardPartsToBraille':
            parts = list(s.parts) if hasattr(s, 'parts') and len(s.parts) else list(s)
            for k, p in enumerate(parts[:2]):
                fp = os.path.join(OUT, '%03d_%s.musicxml' % (rec['id'], 'RL'[k]))
                p.write('musicxml', fp=fp)
                files.append(os.path.basename(fp))
        else:
            src = s
            if isinstance(s, stream.Measure):
                part = stream.Part()
                part.append(s)
                src = part
            fp = os.path.join(OUT, '%03d.musicxml' % rec['id'])
            src.write('musicxml', fp=fp)
            files.append(os.path.basename(fp))
    except Exception as e:  # noqa
        rec['exportError'] = str(e)
    rec['files'] = files
    records.append(rec)


T.Test.runB = runB
T.Test.runE = lambda self: None
suite = unittest.TestLoader().loadTestsFromTestCase(T.Test)
unittest.TextTestRunner(stream=open(os.devnull, 'w'), verbosity=0).run(suite)

with open(os.path.join(OUT, 'cases.json'), 'w', encoding='utf-8') as f:
    json.dump(records, f, ensure_ascii=False, indent=1)
print('cases:', len(records),
      '| music21 matches its own answer:', sum(1 for r in records if r.get('m21ok')),
      '| export errors:', sum(1 for r in records if r.get('exportError')),
      '| methods:', {m: sum(1 for r in records if r['method'] == m) for m in set(r['method'] for r in records)})
