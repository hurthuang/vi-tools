// 中英分語音匯出（原生層）：exportAudio 傳 segments（每段指定語音）與 pause（換語音處的停頓）
import { readFileSync } from 'node:fs';

// WAV 長度（秒）
function duration(path) {
  const b = readFileSync(path);
  let pos = 12, rate = 16000, block = 2;
  while (pos + 8 <= b.length) {
    const id = b.toString('ascii', pos, pos + 4), size = b.readUInt32LE(pos + 4);
    if (id === 'fmt ') { rate = b.readUInt32LE(pos + 12); block = b.readUInt16LE(pos + 20); }
    if (id === 'data') return size / block / rate;
    pos += 8 + size + (size & 1);
  }
  return 0;
}

export default {
  name: '中英分語音匯出（原生層）',
  needsApp: true,
  async run({ cdp, check, saveDialog, outPath, sleep }) {
    check('vitoolsDesktop.features 含 segments', await cdp.ev(`window.vitoolsDesktop.features.includes('segments')`));
    const voices = await cdp.ev(`window.vitoolsDesktop.getVoices()`);
    const zh = voices.find(v => /^zh-TW/i.test(v.lang)), en = voices.find(v => /^en/i.test(v.lang));
    if (!check('這台電腦有中文與英文語音', !!zh && !!en)) return;

    const segs = [
      { text: '請開啟 ', voiceId: zh.id }, { text: 'Microsoft Word', voiceId: en.id },
      { text: ' 檔案，按下 ', voiceId: zh.id }, { text: 'Save As', voiceId: en.id }, { text: ' 另存新檔。', voiceId: zh.id },
    ];
    const text = segs.map(s => s.text).join('');
    const lengths = {};
    for (const pause of ['original', 'natural', 'min']) {
      const path = outPath(`segments-${pause}.wav`);
      await cdp.ev(`window.__exp = window.vitoolsDesktop.exportAudio({ text: ${JSON.stringify(text)}, voiceId: ${JSON.stringify(zh.id)},
        segments: ${JSON.stringify(segs)}, pause: '${pause}' }); true`);
      const r = await saveDialog(path);
      const res = await cdp.ev('window.__exp');
      lengths[pause] = r.ok && res.saved ? duration(path) : 0;
      await sleep(300);
    }
    // 對照：同一段文字整段用中文語音
    const plain = outPath('segments-plain.wav');
    await cdp.ev(`window.__exp = window.vitoolsDesktop.exportAudio({ text: ${JSON.stringify(text)}, voiceId: ${JSON.stringify(zh.id)} }); true`);
    await saveDialog(plain);
    await cdp.ev('window.__exp');
    lengths.plain = duration(plain);

    const f = n => n.toFixed(2);
    const desc = `保留原本 ${f(lengths.original)}、縮短 ${f(lengths.natural)}、最短 ${f(lengths.min)}、整段中文 ${f(lengths.plain)} 秒`;
    check('三種停頓都匯出成功', lengths.original > 0 && lengths.natural > 0 && lengths.min > 0, desc);
    check('停頓：保留原本 > 縮短 > 最短', lengths.original > lengths.natural && lengths.natural > lengths.min, desc);
    check('分段匯出和整段中文不同（英文段換了語音）', Math.abs(lengths.natural - lengths.plain) > 0.05, desc);
  },
};
