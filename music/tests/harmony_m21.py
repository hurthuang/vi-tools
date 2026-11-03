"""以 music21 核對平行、反向五八度：node tests/harmony-test.js --cases > hcases.json; python tests/harmony_m21.py hcases.json"""
import json, sys
from music21 import note, voiceLeading, pitch

def pit(s):
    step, rest = s[0], s[1:]
    acc = ''
    while rest and rest[0] in '#b':
        acc += rest[0]; rest = rest[1:]
    return note.Note(pitch.Pitch(step + acc.replace('b', '-') + rest))

cases = json.load(open(sys.argv[1], encoding='utf-8'))
bad = {'parallel': 0, 'contrary': 0}
count = {'parallel': 0, 'contrary': 0}
for c in cases:
    q = voiceLeading.VoiceLeadingQuartet(pit(c['u1']), pit(c['u2']), pit(c['l1']), pit(c['l2']))
    # music21 的 parallelOctave 也把八度→十五度的反向進行算進去，所以分兩項比：
    # 1. 連續完全五度／八度（平行或反向都算）：music21 的 parallel* 或 antiParallelMotion('P5'/'P8'/'P1')
    # 2. 其中反向的部分：兩個聲部方向相反
    anti = any(q.antiParallelMotion(x) for x in ('P5', 'P8', 'P1'))
    seq = bool(q.parallelFifth() or q.parallelOctave() or q.parallelUnison() or q.parallelUnisonOrOctave() or anti)
    d1 = q.v1n2.pitch.ps - q.v1n1.pitch.ps
    d2 = q.v2n2.pitch.ps - q.v2n1.pitch.ps
    con = seq and d1 * d2 < 0
    mine = {'parallel': c['parallel'] or c['contrary'], 'contrary': c['contrary']}
    for k, m in (('parallel', seq), ('contrary', con)):
        count[k] += m
        if m != mine[k]:
            bad[k] += 1
            if bad[k] < 8: print(k, 'mine', mine[k], 'm21', m, c['u1'], c['u2'], c['l1'], c['l2'])
print('pairs', len(cases), 'm21 parallel', count['parallel'], 'contrary', count['contrary'], 'bad', bad)
