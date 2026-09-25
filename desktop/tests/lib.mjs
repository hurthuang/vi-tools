// 桌面版自動測試共用工具：啟動 app、透過 CDP（WebView2 遠端除錯）操作頁面、處理存檔視窗、記錄結果
import { spawn, execFile, execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, win32 } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const PORT = 9333;
export const OUT = join(tmpdir(), 'vitools-tests');
mkdirSync(OUT, { recursive: true });
export const sleep = ms => new Promise(r => setTimeout(r, ms));
export const outPath = name => win32.normalize(join(OUT, name));

// ── 結果記錄
export const results = { pass: 0, fail: 0, failures: [] };
let currentTest = '';
export function setCurrentTest(name) { currentTest = name; }
export function check(name, ok, detail = '') {
  if (ok) results.pass++;
  else { results.fail++; results.failures.push(`[${currentTest}] ${name}${detail ? '：' + detail : ''}`); }
  console.log(`  ${ok ? '✓' : '✗'} ${name}${!ok && detail ? '　→ ' + detail : ''}`);
  return ok;
}

// ── app 啟動與關閉
export function appRunning() {
  try { return execFileSync('tasklist', ['/FI', 'IMAGENAME eq ViTools.exe', '/NH'], { encoding: 'utf8' }).includes('ViTools.exe'); }
  catch { return false; }
}
export function killApp() {
  try { execFileSync('taskkill', ['/IM', 'ViTools.exe', '/F'], { stdio: 'ignore' }); } catch {}
}

// 每次用新的 WebView2 設定資料夾（VITOOLS_USER_DATA），測試不會影響使用者平常的設定
// ViTools.exe 結束後，它的 WebView2 瀏覽器程序會多留一下、繼續佔著除錯埠；
// 每次換一個埠，並等埠關掉，才不會連到上一次留下的舊瀏覽器
let nextPort = PORT;
async function portAlive(port) {
  try { await fetch(`http://localhost:${port}/json/version`, { signal: AbortSignal.timeout(1000) }); return true; }
  catch { return false; }
}
async function waitPortClosed(port, ms = 15000) {
  for (let t = 0; t < ms && await portAlive(port); t += 500) await sleep(500);
}

// 每次用新的 WebView2 設定資料夾（VITOOLS_USER_DATA），測試不會影響使用者平常的設定
// opts.env：額外的環境變數（例如 VITOOLS_SIMULATE_OFFLINE: '1' 模擬斷線）
// 預設 VITOOLS_WEB=local：用內附網頁，測試結果不受線上網頁內容影響（測線上時傳 VITOOLS_WEB: '' 或 'online'）
export async function startApp(exe, opts = {}) {
  killApp();
  await sleep(1500);
  let port = nextPort++;
  while (await portAlive(port)) port = nextPort++;
  const userData = mkdtempSync(join(tmpdir(), 'vitools-test-profile-'));
  const child = spawn(exe, [], {
    env: { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}`, VITOOLS_USER_DATA: userData, VITOOLS_WEB: 'local', ...(opts.env || {}) },
    detached: true, stdio: 'ignore',
  });
  child.unref();

  let page = null;
  for (let i = 0; i < 60 && !page; i++) {
    try {
      const list = await (await fetch(`http://localhost:${port}/json`)).json();
      page = list.find(t => t.type === 'page' && /index\.html/.test(t.url));
    } catch {}
    if (!page) await sleep(500);
  }
  if (!page) throw new Error('app 沒有啟動，或首頁沒有載入');
  const cdp = await connect(page.webSocketDebuggerUrl);
  // 等首頁載入、各分頁（iframe）都載入完成，橋接程式才會注入
  let ready = false;
  for (let i = 0; i < 60 && !ready; i++) {
    ready = await cdp.ev(`/index\\.html/.test(location.href) && document.querySelectorAll('iframe').length > 0 &&
      [...document.querySelectorAll('iframe')].every(f => { try { return f.contentDocument.readyState === 'complete' && f.contentWindow.location.href !== 'about:blank'; } catch { return false; } })`).catch(() => false) === true;
    if (!ready) await sleep(500);
  }
  if (!ready) throw new Error('首頁或分頁沒有載入完成');
  await sleep(1000);
  return {
    cdp,
    async stop() {
      cdp.close();
      killApp();
      await waitPortClosed(port);
      try { rmSync(userData, { recursive: true, force: true }); } catch {}
    },
  };
}

// ── CDP 連線：ev() 在首頁執行運算式；頁面丟出的例外記在 exceptions
export async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let id = 0;
  const pending = new Map();
  const exceptions = [];
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    else if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      exceptions.push(`${d.exception?.description || d.text} @ ${d.url || '?'}:${d.lineNumber}`);
    }
  };
  const send = (method, params = {}) => new Promise(r => {
    const i = ++id;
    pending.set(i, r);
    ws.send(JSON.stringify({ id: i, method, params }));
  });
  await send('Runtime.enable');
  return {
    send,
    exceptions,
    close: () => ws.close(),
    async ev(expr) {
      const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      if (r.result.exceptionDetails) throw new Error('頁面執行錯誤：' + (r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text));
      return r.result.result.value;
    },
    async key(code, key, modifiers) {
      for (const type of ['rawKeyDown', 'keyUp'])
        await send('Input.dispatchKeyEvent', { type, modifiers, key, code, windowsVirtualKeyCode: key.toUpperCase().charCodeAt(0) });
    },
  };
}

// 首頁分頁（iframe）的 window / document 運算式
export const win = frame => `document.getElementById('${frame}').contentWindow`;
export const doc = frame => `document.getElementById('${frame}').contentDocument`;

// 等某個條件成立（運算式回傳 truthy），最多 ms 毫秒；回傳最後的值
export async function waitFor(cdp, expr, ms = 8000) {
  let v;
  for (let t = 0; t < ms; t += 250) {
    v = await cdp.ev(expr).catch(() => undefined);
    if (v) return v;
    await sleep(250);
  }
  return v;
}

const saveDialogScript = readFileSync(join(here, 'save-dialog.ps1'), 'utf8');

// 存檔視窗按「取消」
export async function cancelDialog() {
  return new Promise(r => execFile('powershell', ['-NoProfile', '-Command', saveDialogScript],
    { env: { ...process.env, VTD_PATH: '', VTD_CANCEL: '1' } }, (e, stdout) => r((stdout || '').trim())));
}

// ── 存檔視窗：用 Win32 API 找「匯出音檔」視窗，填入檔名並按「存檔」；等檔案寫出來
export async function saveDialog(path, ms = 30000) {
  try { rmSync(path, { force: true }); } catch {}
  const out = await new Promise(r => execFile('powershell', ['-NoProfile', '-Command', saveDialogScript],
    { env: { ...process.env, VTD_PATH: path } }, (e, stdout) => r((stdout || '').trim())));
  for (let t = 0; t < ms; t += 250) {
    if (existsSync(path) && statSync(path).size > 0) { await sleep(300); return { ok: true, out }; }
    await sleep(250);
  }
  return { ok: false, out };
}

// 音檔格式粗檢：WAV 開頭 RIFF/WAVE；MP3 開頭 ID3 或 MPEG frame sync
export function audioKind(path) {
  if (!existsSync(path)) return null;
  const b = readFileSync(path);
  if (b.length < 12) return null;
  if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WAVE') return 'wav';
  if (b.toString('ascii', 0, 3) === 'ID3' || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)) return 'mp3';
  return 'unknown';
}

// 真的用滑鼠點分頁裡的元素（CDP 輸入事件）：瀏覽器才會視為使用者操作，允許播放聲音；id 或 CSS 選擇器都可以
export async function realClick(cdp, frame, id) {
  const pos = await cdp.ev(`(() => {
    const f = document.getElementById('${frame}'), d = f.contentDocument, e = d.getElementById(${JSON.stringify(id)}) || d.querySelector(${JSON.stringify(id)});
    e.scrollIntoView({ block: 'center' });
    const fr = f.getBoundingClientRect(), r = e.getBoundingClientRect();
    return { x: fr.left + r.left + r.width / 2, y: fr.top + r.top + r.height / 2 };
  })()`);
  for (const type of ['mousePressed', 'mouseReleased'])
    await cdp.send('Input.dispatchMouseEvent', { type, x: pos.x, y: pos.y, button: 'left', clickCount: 1 });
}

// 攔截分頁裡用 <a download> 觸發的下載（例如「存報讀檔」）：不真的存到下載資料夾，改記下檔名與內容
// 用法：await captureDownloads(cdp, 'frame-nc')；按按鈕；const f = await takeDownload(cdp, 'frame-nc') → { name, text }
export async function captureDownloads(cdp, frame) {
  await cdp.ev(`(() => {
    const w = document.getElementById('${frame}').contentWindow;
    w.__downloads = [];
    const orig = w.HTMLAnchorElement.prototype.click;
    w.HTMLAnchorElement.prototype.click = function () {
      if (!this.download) return orig.call(this);
      const a = this;
      w.__downloads.push(fetch(a.href).then(r => r.text()).then(text => ({ name: a.download, text })));
    };
  })()`);
}
export async function takeDownload(cdp, frame) {
  return cdp.ev(`(() => { const d = document.getElementById('${frame}').contentWindow.__downloads; return d && d.length ? d.shift() : null; })()`);
}

// app 視窗標題（網頁裡看不到，用 PowerShell 讀）
export function appTitle() {
  try {
    return execFileSync('powershell', ['-NoProfile', '-Command',
      "[Console]::OutputEncoding = [Text.Encoding]::UTF8; (Get-Process ViTools -ErrorAction SilentlyContinue | Where-Object MainWindowTitle | Select-Object -First 1).MainWindowTitle"],
      { encoding: 'utf8' }).trim();
  } catch { return ''; }
}

// app 跳出的訊息視窗（標題「視障輔助工具集」）：回傳內文並按「確定」關掉；沒有就回傳 null
export function closeAppMessageBox() {
  const script = `
Add-Type @'
using System; using System.Text; using System.Runtime.InteropServices;
public static class VtdMsg {
  public delegate bool P(IntPtr h, IntPtr l);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern IntPtr FindWindow(string c, string t);
  [DllImport("user32.dll")] public static extern bool EnumChildWindows(IntPtr h, P p, IntPtr l);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr h, int m, IntPtr w, IntPtr l);
  public static string Text(IntPtr dlg) { var sb = new StringBuilder();
    EnumChildWindows(dlg, (h, l) => { var c = new StringBuilder(32); GetClassName(h, c, 32);
      if (c.ToString() == "Static") { var t = new StringBuilder(512); GetWindowText(h, t, 512); sb.Append(t); } return true; }, IntPtr.Zero);
    return sb.ToString(); }
}
'@
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$title = [string]::new([char[]]@(0x8996, 0x969C, 0x8F14, 0x52A9, 0x5DE5, 0x5177, 0x96C6))
$h = [IntPtr]::Zero
for ($i = 0; $i -lt 40 -and $h -eq [IntPtr]::Zero; $i++) { $h = [VtdMsg]::FindWindow('#32770', $title); if ($h -eq [IntPtr]::Zero) { Start-Sleep -Milliseconds 250 } }
if ($h -eq [IntPtr]::Zero) { 'NONE'; exit }
[VtdMsg]::Text($h)
[void][VtdMsg]::SendMessage($h, 0x0111, [IntPtr]1, [IntPtr]::Zero)
`;
  try {
    const out = execFileSync('powershell', ['-NoProfile', '-Command', script], { encoding: 'utf8' }).trim();
    return out === 'NONE' ? null : out;
  } catch { return null; }
}
