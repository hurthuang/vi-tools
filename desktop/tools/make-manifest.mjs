// 桌面版自動更新用的檔案清單：每個檔案的路徑、SHA-256 與大小
//   node desktop/tools/make-manifest.mjs --dist <可攜版資料夾> --out manifest.json [--commit <sha>] [--exe-url <網址>]
//     發佈 desktop-v* 時：從 dotnet publish 的結果產生（web\、desktop-assets\、ViTools.exe），和實際打包的檔案完全一致
//   node desktop/tools/make-manifest.mjs --repo <vi-tools 根目錄> --out web-manifest.json [--commit <sha>]
//     推 master 時：依 ViTools.csproj 的 BundleWebAndZip 同樣的規則，從 repo 挑出網頁與內附資源（沒有 ViTools.exe）
//   app 依清單比對本機檔案，只下載不同的檔案；網頁與資源從 raw.githubusercontent.com 的 <commit> 取得
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; };
const here = dirname(fileURLToPath(import.meta.url));
const proj = readFileSync(join(here, '..', 'ViTools.csproj'), 'utf8');
const version = /<Version>([^<]+)<\/Version>/.exec(proj)[1];

/** 資料夾底下所有檔案（相對路徑，/ 分隔） */
function walk(dir, base = dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p, base));
    else out.push(relative(base, p).split('\\').join('/'));
  }
  return out;
}

/** repo 模式：和 ViTools.csproj 的 BundleWebAndZip 相同的挑選規則（改了那邊要一起改，desktop 測試會比對兩者） */
export function repoFiles(root) {
  const list = []; // [清單路徑, 來源檔]
  for (const name of readdirSync(root)) {
    const p = join(root, name);
    if (!statSync(p).isFile() || /^reg-/i.test(name)) continue;
    if (/\.(html|htm|js|json|ttf)$/i.test(name)) list.push(['web/' + name, p]);
  }
  for (const sub of ['table', 'mathcat']) for (const f of walk(join(root, sub))) list.push([`web/${sub}/${f}`, join(root, sub, f)]);
  for (const f of walk(join(root, 'music'))) {
    if (/^tests\//.test(f) || f === 'README.md' || f === '.gitignore') continue;
    list.push([`web/music/${f}`, join(root, 'music', f)]);
  }
  for (const f of walk(join(root, 'desktop', 'desktop-assets'))) list.push([`desktop-assets/${f}`, join(root, 'desktop', 'desktop-assets', f)]);
  return list;
}

/** 可攜版模式：web\、desktop-assets\ 底下所有檔案，加上 ViTools.exe */
export function distFiles(dist) {
  const list = [];
  for (const sub of ['web', 'desktop-assets']) for (const f of walk(join(dist, sub))) list.push([`${sub}/${f}`, join(dist, sub, f)]);
  if (existsSync(join(dist, 'ViTools.exe'))) list.push(['ViTools.exe', join(dist, 'ViTools.exe')]);
  return list;
}

export function build(list) {
  const files = {};
  for (const [path, src] of list.sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const buf = readFileSync(src);
    files[path] = { sha256: createHash('sha256').update(buf).digest('hex'), size: buf.length };
  }
  return files;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dist = arg('--dist');
  const repo = arg('--repo');
  const out = arg('--out');
  if ((!dist && !repo) || !out) {
    console.error('用法：--dist <可攜版資料夾> 或 --repo <vi-tools 根目錄>，加上 --out <輸出檔>');
    process.exit(2);
  }
  const files = build(dist ? distFiles(resolve(dist)) : repoFiles(resolve(repo)));
  const manifest = {
    // version：產生清單時 ViTools.csproj 的版本；minApp：要套用這份清單，app 至少要這個版本（網頁可能用到新版 app 才有的功能）
    version,
    minApp: version,
    commit: arg('--commit') || '',
    exeUrl: arg('--exe-url') || '',
    files,
  };
  writeFileSync(out, JSON.stringify(manifest, null, 1));
  console.log(`清單：${Object.keys(files).length} 個檔案，版本 ${version} → ${out}`);
}
