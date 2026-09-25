// ViTools.exe --tts-test：不開視窗直接合成中英文測試句，輸出 WAV 與 MP3
import { execFile } from 'node:child_process';
import { statSync, rmSync } from 'node:fs';

export default {
  name: '命令列語音合成（--tts-test）',
  needsApp: false,
  async run({ check, exe, outPath, audioKind }) {
    for (const ext of ['wav', 'mp3']) {
      const path = outPath(`cli.${ext}`);
      try { rmSync(path, { force: true }); } catch {}
      const err = await new Promise(r => execFile(exe, ['--tts-test', path], { timeout: 60000 }, e => r(e)));
      check(`${ext.toUpperCase()}：程式正常結束`, !err, err && err.message);
      const kind = audioKind(path);
      check(`${ext.toUpperCase()}：檔案格式正確`, kind === ext, `偵測為 ${kind}`);
      // 12 秒左右的測試句：WAV（16kHz 16bit）約 380KB，MP3（64kbps）約 95KB
      const size = kind ? statSync(path).size : 0;
      check(`${ext.toUpperCase()}：檔案大小合理`, ext === 'wav' ? size > 200000 : size > 50000, `${size} bytes`);
    }
  },
};
