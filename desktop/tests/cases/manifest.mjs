// 自動更新的檔案清單（desktop/tools/make-manifest.mjs）：
//   推 master 時從 repo 依規則挑檔案（web-manifest.json），發佈時從可攜版資料夾產生（manifest.json）
//   兩邊挑出的檔案要一模一樣，否則 app 會少更新或多下載檔案（改了 ViTools.csproj 的 BundleWebAndZip 要一起改）
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

export default {
  name: '自動更新的檔案清單',
  needsApp: false,
  async run({ check, exe, portable }) {
    if (!portable) { console.log('  （要和可攜版比對，用 --exe dist\\ViTools\\ViTools.exe）'); return; }
    const mk = await import(pathToFileURL(join(here, '..', '..', 'tools', 'make-manifest.mjs')).href);
    const fromRepo = mk.repoFiles(resolve(here, '..', '..', '..')).map(([p]) => p).sort();
    const fromDist = mk.distFiles(dirname(exe)).map(([p]) => p).filter((p) => p !== 'ViTools.exe').sort();
    const onlyRepo = fromRepo.filter((p) => !fromDist.includes(p));
    const onlyDist = fromDist.filter((p) => !fromRepo.includes(p));
    check(`repo 挑出的檔案和可攜版一致（${fromRepo.length} 個）`, !onlyRepo.length && !onlyDist.length,
      `只在 repo：${onlyRepo.join(', ')}；只在可攜版：${onlyDist.join(', ')}`);
    check('可攜版有 ViTools.exe', mk.distFiles(dirname(exe)).some(([p]) => p === 'ViTools.exe'));
  },
};
