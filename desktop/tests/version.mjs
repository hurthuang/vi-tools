// 測試用的版本號：讀 ViTools.csproj 的 <Version>，升版時不用改測試
import { readFileSync } from 'node:fs';

const proj = readFileSync(new URL('../ViTools.csproj', import.meta.url), 'utf8');
/** 目前的版本（例如 0.2.0） */
export const VER = /<Version>([^<]+)<\/Version>/.exec(proj)[1];
const [major, minor] = VER.split('.').map(Number);
/** 比目前新的版本（次版號加一），給檢查更新的假伺服器用 */
export const NEXT = `${major}.${minor + 1}.0`;
/** 放進正規表示式時，點要跳脫 */
export const re = (v) => v.replace(/\./g, '\\.');
