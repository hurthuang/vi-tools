// 產生隨機題目給 music21 核對：node tests/theory-cases.js > cases.json
require('../js/theory.js');
const T = MB.theory;
let seed = 12345;
const rnd = (n) => ((seed = (seed * 1103515245 + 12345) % 2147483648), Math.floor(seed / 65536) % n);
const randNote = (lo, hi) => ({ step: T.STEPS[rnd(7)], alter: rnd(5) === 0 ? (rnd(2) ? 1 : -1) : rnd(9) === 0 ? (rnd(2) ? 2 : -2) : 0, octave: lo + rnd(hi - lo + 1) });
const en = (n) => T.nameEn(n, { octave: true });
const out = { intervals: [], chords: [], romans: [] };
for (let i = 0; i < 600; i++) {
  const a = randNote(3, 4), b = randNote(3, 5);
  const iv = T.interval(a, b);
  out.intervals.push({ a: en(a), b: en(b), number: iv.number, quality: iv.quality, semitones: iv.semitones });
}
for (let i = 0; i < 400; i++) {
  const types = T.CHORD_TYPES.map((t) => t[0]);
  const root = { ...randNote(3, 3), alter: rnd(3) - 1 };
  const code = types[rnd(types.length)];
  const tones = T.buildChord(root, code);
  const inv = rnd(tones.length);
  if (tones.some((n) => Math.abs(n.alter) > 2)) { i--; continue; }
  const voiced = tones.map((n, k) => (k < inv ? { ...n, octave: n.octave + 1 } : n));
  const c = T.identifyChord(voiced);
  out.chords.push({ notes: voiced.map(en), type: c && c.type, inversion: c && c.inversion, root: c && T.nameEn(c.root) });
}
const keys = [-4, -3, -2, -1, 0, 1, 2, 3, 4];
for (let i = 0; i < 400; i++) {
  const f = keys[rnd(keys.length)];
  const mode = rnd(2) ? 'major' : 'minor';
  const k = T.keyFromFifths(f);
  const key = { tonic: mode === 'major' ? k.major : k.minor, mode };
  const deg = 1 + rnd(7);
  const sev = rnd(2) === 0;
  const tones = T.diatonicTriad(key, deg, sev);
  const inv = rnd(tones.length);
  const voiced = tones.map((n, k2) => (k2 < inv ? { ...n, octave: n.octave + 1 } : n));
  const c = T.identifyChord(voiced);
  const r = T.romanNumeral(c, key);
  out.romans.push({ key: T.nameEn(key.tonic) + (mode === 'minor' ? 'm' : ''), notes: voiced.map(en), symbol: r && r.symbol, degree: r && r.degree, inversion: c && c.inversion, type: c && c.type });
}
console.log(JSON.stringify(out));
