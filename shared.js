// ════════════════════════════════════════════════════════════
//  shared.js — bt / b2t / p2a / nc 共用模組
//  包含：cleanExamText、loadScript、handleOpenFile、
//        格式調整 Modal（CSS + HTML 動態注入）、六點輸入浮動面板
// ════════════════════════════════════════════════════════════
'use strict';

// ════════════════════════════════════════════════════════════
//  loadScript（lazy CDN 載入）
// ════════════════════════════════════════════════════════════
function loadScript(src) {
    return new Promise((resolve, reject) => {
        if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
        const s = document.createElement('script');
        s.src = src;
        s.onload = resolve;
        s.onerror = () => reject(new Error('無法載入：' + src));
        document.head.appendChild(s);
    });
}

// ════════════════════════════════════════════════════════════
//  cleanExamText — 共用核心（opts 參數化）
// ════════════════════════════════════════════════════════════
function cleanExamText(text, opts) {
    opts = Object.assign({
        cjkSpace:       true,
        rmAns:          true,
        optNewline:     true,
        sectionNewline: true,
        fixHyphen:      true,
    }, opts);

    // ── 0a. 帶空格的選項括號正規化 ──
    text = text.replace(/[（(]\s*[Ａ]\s*[）)]/g,'(A)').replace(/[（(]\s*[Ｂ]\s*[）)]/g,'(B)')
               .replace(/[（(]\s*[Ｃ]\s*[）)]/g,'(C)').replace(/[（(]\s*[Ｄ]\s*[）)]/g,'(D)');
    text = text.replace(/[（(]\s*A\s*[）)]/g,'(A)').replace(/[（(]\s*B\s*[）)]/g,'(B)')
               .replace(/[（(]\s*C\s*[）)]/g,'(C)').replace(/[（(]\s*D\s*[）)]/g,'(D)');
    text = text.replace(/（[\s　]{0,4}）\s*/g, '');

    // ── 0b. 連字號斷字修復 ──
    if (opts.fixHyphen) {
        text = text.replace(/([a-zA-Z])-\n([a-z])/g, '$1$2');
    }

    // ── 1. Markdown 殘留清除 ──
    text = text.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*\*/g, '');
    text = text.replace(/^\|[\s\-|:]+\|$/gm, '');
    text = text.replace(/^\|(.+)\|$/gm, (_, inner) =>
        inner.split('|').map(s => s.trim()).filter(Boolean).join('\t')
    );

    // ── 2. 去掉答題括號 ──
    if (opts.rmAns) {
        text = text.replace(/（[\s　]{0,4}）\s*/g, '');
        text = text.replace(/\(\s{0,4}\)\s*/g, '');
    }

    // ── 2b. 孤立題號與後續文字合併 ──
    {
        const LONE_QNUM = /^\d{1,3}\s*[\.。、]\s*$/;
        const isOptLine  = l => /^\([A-D]\)/.test(l.trim());
        const isSectLine = l => /^[一二三四五六七八九十][、．]/.test(l.trim()) ||
                                /^[★※【第]/.test(l.trim());
        const lines2b = text.split('\n');
        const out2b = [];
        let i = 0;
        while (i < lines2b.length) {
            const cur = lines2b[i].trim();
            if (LONE_QNUM.test(cur)) {
                let j = i + 1;
                while (j < lines2b.length && lines2b[j].trim() === '') j++;
                const next = j < lines2b.length ? lines2b[j].trim() : '';
                if (next && !isOptLine(next) && !isSectLine(next) && !LONE_QNUM.test(next)) {
                    out2b.push(cur + ' ' + next);
                    i = j + 1;
                    continue;
                }
            }
            out2b.push(lines2b[i]);
            i++;
        }
        text = out2b.join('\n');
    }

    // ── 3. 前插換行 ──
    if (opts.sectionNewline) {
        text = text.replace(/([^\n])([一二三四五六七八九十][、．])/g, '$1\n\n$2');
        text = text.replace(/([^\n\d])(\d{1,3}\s*[\.。、]\s*)(?=[^\d])/g, '$1\n$2');
        text = text.replace(/([^\n])(\([A-D]\))/g, '$1\n$2');
    }

    // ── 4. Tab、全形空格；行首尾去空白；行內多空格合一 ──
    text = text.replace(/\t/g, ' ').replace(/　/g, ' ');
    text = text.split('\n').map(l => l.trim().replace(/ {2,}/g, ' ')).join('\n');

    // ── 4b. 題號後補空格 ──
    text = text.replace(/^(\d{1,3}\s*[\.。、])(?=\S)/gm, '$1 ');

    // ── 4c. 選項標籤後補空格 ──
    text = text.replace(/^(\([A-D]\))(?=\S)/gm, '$1 ');

    // ── 5. 全形括號 → 半形 ──
    text = text.replace(/（/g, '(').replace(/）/g, ')');

    // ── 6. 數字與中文間加空格 ──
    if (opts.cjkSpace) {
        const PUNCT = '，。、！？；：「」『』（）【】〔〕〈〉《》…—–·・';
        const excl6 = `\\s\\d\\(\\)\\{\\}\\[\\]\\.,:;\\-\\+\\*\\/\\\\<>!?='"$&%#@\`^~｜|a-zA-Z${PUNCT}`;
        const re6a = new RegExp(`(\\d)([^${excl6}])`, 'g');
        const re6b = new RegExp(`([^${excl6}])(\\d)`, 'g');
        text = text.replace(re6a, '$1 $2');
        text = text.replace(re6b, '$1 $2');
    }

    // ── 7. 中英文之間加空格 ──
    if (opts.cjkSpace) {
        const HANZ_RE  = /[\u4E00-\u9FFF\u3400-\u4DBF\uF900-\uFAFF]/;
        const ALNUM_RE = /[a-zA-Z0-9]/;
        let r = '';
        for (let i = 0; i < text.length; i++) {
            const ch = text[i], prev = text[i-1] || '';
            if (prev && prev !== '\n' && ch !== '\n' &&
                ((HANZ_RE.test(prev) && ALNUM_RE.test(ch)) ||
                 (ALNUM_RE.test(prev) && HANZ_RE.test(ch)))) r += ' ';
            r += ch;
        }
        text = r;
    }

    // ── 7b. 中文字之間去除多餘空格 ──
    {
        let prev7b;
        do {
            prev7b = text;
            text = text.replace(/([\u2E80-\u9FFF\uF900-\uFAFF\uFE30-\uFE4F]) ([\u2E80-\u9FFF\uF900-\uFAFF\uFE30-\uFE4F])/g, '$1$2');
        } while (text !== prev7b);
    }

    // ── 8. 逐行整理（選項版面）──
    const isOpt        = l => /^\([A-D]\)/.test(l);
    const isBlank      = l => l.trim() === '';
    const isSectionOrQ = l =>
        /^[一二三四五六七八九十][、．]/.test(l) ||
        /^[★※【第]/.test(l) ||
        /^\d{1,3}\s*[\.。、]/.test(l);

    const isStem = (line, nextLine) => {
        const t = line.trim();
        if (isSectionOrQ(t)) return true;
        if (/[。？！!?：:]\s*$/.test(t)) return true;
        if (t.length >= 15) return true;
        if (nextLine && isOpt(nextLine.trim()) && /^\(A\)/.test(nextLine.trim())) return true;
        if (nextLine && isSectionOrQ(nextLine.trim())) return true;
        return false;
    };

    const clean = text.split('\n').filter(l => !isBlank(l));
    const merged = [];
    for (let i = 0; i < clean.length; i++) {
        const line = clean[i];
        const nextLine = clean[i + 1] || '';
        const prevMerged = merged[merged.length - 1] || '';
        if (!isOpt(line) && !isSectionOrQ(line) &&
            merged.length > 0 && isOpt(prevMerged) &&
            !isStem(line, nextLine)) {
            merged[merged.length - 1] += ' ' + line;
        } else {
            merged.push(line);
        }
    }

    const split = [];
    for (const line of merged) {
        if (isOpt(line) && /\([B-D]\)/.test(line)) {
            line.split(/(?=\([A-D]\))/).map(s=>s.trim()).filter(Boolean).forEach(o=>split.push(o));
        } else if (!isOpt(line) && /\(A\)/.test(line)) {
            const aIdx = line.indexOf('(A)');
            const qPart = line.slice(0, aIdx).trim();
            const optPart = line.slice(aIdx);
            if (qPart) split.push(qPart);
            optPart.split(/(?=\([A-D]\))/).map(s=>s.trim()).filter(Boolean).forEach(o=>split.push(o));
        } else if (!isOpt(line) && /\([B-D]\)/.test(line) && !isSectionOrQ(line)) {
            const firstB = line.search(/\([B-D]\)/);
            const aPart = line.slice(0, firstB).trim();
            const rest = line.slice(firstB);
            if (aPart) split.push('(A) ' + aPart);
            rest.split(/(?=\([A-D]\))/).map(s=>s.trim()).filter(Boolean).forEach(o=>split.push(o));
        } else {
            split.push(line);
        }
    }

    if (!opts.optNewline) {
        const noSplitOut = [];
        let i = 0;
        while (i < split.length) {
            const line = split[i];
            if (isOpt(line)) {
                let optGroup = line;
                while (i+1 < split.length && isOpt(split[i+1])) {
                    i++; optGroup += '　' + split[i];
                }
                noSplitOut.push(optGroup);
            } else {
                noSplitOut.push(line);
            }
            i++;
        }
        return noSplitOut.join('\n').replace(/\n{3,}/g, '\n\n').trim();
    }

    const out = [];
    for (let i = 0; i < split.length; i++) {
        const line = split[i];
        out.push(line);
        if (isOpt(line)) {
            const letter = line.match(/^\(([A-D])\)/)[1];
            const next = split[i+1];
            const nextIsOpt = next && isOpt(next);
            const nextLetter = nextIsOpt ? next.match(/^\(([A-D])\)/)[1] : null;
            const expectedNext = { A:'B', B:'C', C:'D' }[letter];
            if (!nextIsOpt || nextLetter !== expectedNext) out.push('');
        }
    }

    return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// ════════════════════════════════════════════════════════════
//  handleOpenFile — 開啟檔案（txt/docx/odt/rtf/pdf）
//  taId:    目標 textarea 的 id
//  onLoad:  載入後 callback（可為 null）
// ════════════════════════════════════════════════════════════
async function handleOpenFile(event, taId, onLoad) {
    const file = event.target.files[0];
    if (!file) return;
    event.target.value = '';

    const ext = file.name.split('.').pop().toLowerCase();
    const textarea = document.getElementById(taId);
    if (!textarea) { console.error('handleOpenFile: 找不到 #' + taId); return; }

    const done = (text) => {
        textarea.value = text;
        if (typeof onLoad === 'function') onLoad();
    };

    if (ext === 'txt') {
        const reader = new FileReader();
        reader.onload = e => done(e.target.result);
        reader.readAsText(file, 'UTF-8');

    } else if (ext === 'docx') {
        if (!window.JSZip) {
            await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
        }
        const arrayBuffer = await file.arrayBuffer();
        try {
            const zip = await JSZip.loadAsync(arrayBuffer);
            const xmlFile = zip.file('word/document.xml');
            if (!xmlFile) throw new Error('找不到 word/document.xml');
            const xmlText = await xmlFile.async('string');
            const parser = new DOMParser();
            const doc = parser.parseFromString(xmlText, 'application/xml');
            const ns = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

            function extractParagraphText(p) {
                const runs = Array.from(p.getElementsByTagName('*'))
                    .filter(el => el.localName === 't');
                let text = '';
                for (const r of runs) text += r.textContent;
                return text;
            }

            const body = doc.getElementsByTagNameNS(ns, 'body')[0];
            const lines = [];
            for (const node of body.childNodes) {
                const local = node.localName;
                if (local === 'p') {
                    lines.push(extractParagraphText(node));
                } else if (local === 'tbl') {
                    const rows = node.getElementsByTagNameNS(ns, 'tr');
                    for (const tr of rows) {
                        const cells = tr.getElementsByTagNameNS(ns, 'tc');
                        const cellTexts = [];
                        for (const tc of cells) {
                            const ps = tc.getElementsByTagNameNS(ns, 'p');
                            const cellLines = [];
                            for (const p of ps) {
                                const t = extractParagraphText(p);
                                if (t.trim()) cellLines.push(t.trim());
                            }
                            cellTexts.push(cellLines.join(' '));
                        }
                        lines.push(cellTexts.join('\t'));
                    }
                    lines.push('');
                }
            }
            done(lines.join('\n').replace(/\n{3,}/g, '\n\n').trim());
            setTimeout(() => {
                alert('如果文件有自動編號，建議改用複製貼上：\n在 Word 中 Ctrl+A 全選 → Ctrl+C 複製，再到輸入框 Ctrl+V 貼上。');
            }, 100);
        } catch(err) {
            alert('DOCX 讀取失敗：' + err.message);
        }

    } else if (ext === 'pdf') {
        if (!window.pdfjsLib) {
            await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
            window.pdfjsLib.GlobalWorkerOptions.workerSrc =
                'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        }
        const arrayBuffer = await file.arrayBuffer();
        try {
            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            let allLines = [];
            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const content = await page.getTextContent({ includeMarkedContent: false });
                let line = '';
                for (const item of content.items) {
                    if (typeof item.str === 'undefined') continue;
                    line += item.str;
                    if (item.hasEOL || item.str.includes('\n')) {
                        allLines.push(line.trim());
                        line = '';
                    }
                }
                if (line.trim()) allLines.push(line.trim());
                allLines.push('');
            }
            done(allLines.join('\n').trim());
        } catch(err) {
            alert('PDF 讀取失敗：' + err.message);
        }

    } else if (ext === 'rtf') {
        const reader = new FileReader();
        reader.onload = e => {
            let raw = e.target.result;
            let out = '';
            let i = 0;
            const len = raw.length;
            while (i < len) {
                const c = raw[i];
                if (c === '\\') {
                    i++;
                    if (i >= len) break;
                    const nc = raw[i];
                    if (nc === '\\') { out += '\\'; i++; }
                    else if (nc === '{') { out += '{'; i++; }
                    else if (nc === '}') { out += '}'; i++; }
                    else if (nc === '\n' || nc === '\r') { out += '\n'; i++; }
                    else if (nc === '\'') {
                        const hex = raw.slice(i + 1, i + 3);
                        const code = parseInt(hex, 16);
                        if (!isNaN(code) && code < 128) out += String.fromCharCode(code);
                        i += 3;
                    } else {
                        let word = '';
                        while (i < len && /[a-zA-Z]/.test(raw[i])) word += raw[i++];
                        let num = '';
                        while (i < len && /[-\d]/.test(raw[i])) num += raw[i++];
                        if (raw[i] === ' ') i++;
                        if (word === 'par' || word === 'line') out += '\n';
                        else if (word === 'tab') out += '\t';
                        else if (word === 'u') {
                            const cp = parseInt(num);
                            if (!isNaN(cp)) out += String.fromCharCode(cp < 0 ? cp + 65536 : cp);
                            if (raw[i] === '\\' && raw[i+1] === '\'') i += 4;
                        }
                    }
                } else if (c === '{' || c === '}') {
                    i++;
                } else {
                    out += c;
                    i++;
                }
            }
            done(out.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim());
        };
        reader.readAsText(file, 'latin1');

    } else if (ext === 'odt') {
        if (!window.JSZip) {
            await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
        }
        const arrayBuffer = await file.arrayBuffer();
        try {
            const zip = await JSZip.loadAsync(arrayBuffer);
            const xmlFile = zip.file('content.xml');
            if (!xmlFile) throw new Error('找不到 content.xml');
            const xmlText = await xmlFile.async('string');
            const parser = new DOMParser();
            const doc = parser.parseFromString(xmlText, 'application/xml');

            const textNS  = 'urn:oasis:names:tc:opendocument:xmlns:text:1.0';
            const tableNS = 'urn:oasis:names:tc:opendocument:xmlns:table:1.0';

            function extractOdtPara(p) {
                let t = '';
                for (const child of p.childNodes) {
                    if (child.nodeType === 3) { t += child.textContent; }
                    else if (child.localName === 'tab') { t += '\t'; }
                    else if (child.localName === 'line-break') { t += '\n'; }
                    else { t += child.textContent; }
                }
                return t;
            }

            const lines = [];
            const textEl = doc.getElementsByTagNameNS(textNS, 'text')[0]
                        || doc.querySelector('text');
            const root = textEl || doc.documentElement;

            function walkNode(node) {
                const local = node.localName;
                const ns = node.namespaceURI;
                if (ns === textNS && (local === 'p' || local === 'h')) {
                    lines.push(extractOdtPara(node));
                } else if (ns === tableNS && local === 'table') {
                    const rows = node.getElementsByTagNameNS(tableNS, 'table-row');
                    for (const tr of rows) {
                        const cells = tr.getElementsByTagNameNS(tableNS, 'table-cell');
                        const cellTexts = [];
                        for (const tc of cells) {
                            const ps = tc.getElementsByTagNameNS(textNS, 'p');
                            const parts = [];
                            for (const p of ps) {
                                const t = extractOdtPara(p).trim();
                                if (t) parts.push(t);
                            }
                            cellTexts.push(parts.join(' '));
                        }
                        lines.push(cellTexts.join('\t'));
                    }
                    lines.push('');
                } else {
                    for (const child of node.childNodes) {
                        if (child.nodeType === 1) walkNode(child);
                    }
                }
            }
            walkNode(root);
            done(lines.join('\n').replace(/\n{3,}/g, '\n\n').trim());
        } catch(err) {
            alert('ODT 讀取失敗：' + err.message);
        }

    } else {
        alert('不支援的檔案格式，請選擇 .txt、.docx、.odt、.rtf 或 .pdf');
    }
}

// ════════════════════════════════════════════════════════════
//  initBraillePanel — 六點輸入統一浮動面板（bt / b2t / nc）
//  opts: {
//    triggerId,     觸發按鈕 id
//    targetId,      目標 textarea id
//    onInsert?,     插入後 callback
//    checkActive?,  () => bool（tab 頁面用）
//    globalToggle?, Ctrl+B 不需要 textarea 有焦點
//    insertFn?,     (bits:number)=>void 覆寫插入邏輯（bt ASCII 模式）
//    externalKbd?,  { toggle(bool), getState:()=>bool }（bt 保留原鍵盤邏輯）
//  }
//  return: { syncKbdState(bool), openPanel, closePanel }
// ════════════════════════════════════════════════════════════
function initBraillePanel(opts) {
    const DOT_BITS = { 1:0x01, 2:0x02, 3:0x04, 4:0x08, 5:0x10, 6:0x20 };
    const KEY_BITS = { 83:0x04, 68:0x02, 70:0x01, 74:0x08, 75:0x10, 76:0x20 };
    const dots = new Set();
    let kbdOn = false, brlCode = 0, held = {};

    // ── CSS 注入（只注一次）───────────────────────────────
    if (!document.getElementById('shared-brlpanel-css')) {
        const st = document.createElement('style');
        st.id = 'shared-brlpanel-css';
        st.textContent = `
            .brlp-trigger:not(.btn){
                padding:3px 10px;font-size:.82em;border-radius:4px;
                border:1px solid #9aa5bc;background:#fff;color:#444;
                cursor:pointer;transition:border-color .15s,color .15s,background .15s;
            }
            .brlp-trigger:not(.btn):hover{border-color:#1565c0;color:#1565c0}
            html[data-theme="dark"] .brlp-trigger:not(.btn){background:#1a1d27;border-color:#343b56;color:#b0bec5}
            html[data-theme="dark"] .brlp-trigger:not(.btn):hover{border-color:#5a99ff;color:#5a99ff}
            .brlp-trigger.kbd-on{background:#1565c0!important;color:#fff!important;border-color:#1565c0!important}
            .brlp-panel{
                display:none;position:fixed;z-index:9200;
                background:#fff;border:1px solid #ccc;border-radius:8px;
                box-shadow:0 4px 20px rgba(0,0,0,.18);
                padding:12px 14px;min-width:210px;
                font-size:.88rem;font-family:inherit;
            }
            .brlp-panel.open{display:block}
            .brlp-kbd-row{display:flex;align-items:center;gap:8px;margin-bottom:5px}
            .brlp-kbd-label{flex:1;font-weight:600;font-size:.85rem}
            .brlp-kbd-btn{
                padding:2px 10px;border-radius:4px;
                border:1px solid #aaa;background:#f5f5f5;
                cursor:pointer;font-size:.82em;
            }
            .brlp-kbd-btn.on{background:#1565c0;color:#fff;border-color:#1565c0}
            .brlp-kbd-hint{font-size:.75rem;color:#888;line-height:1.6;margin-bottom:8px}
            .brlp-divider{border:none;border-top:1px solid #eee;margin:8px 0}
            .brlp-dot-label{font-weight:600;font-size:.85rem;margin-bottom:6px}
            .brlp-body{display:flex;align-items:center;gap:10px}
            .brlp-grid{
                display:grid;grid-template-columns:1fr 1fr;gap:5px;
                padding:7px;background:#f5f5f5;border:1px solid #ddd;border-radius:6px;
            }
            .brlp-dot{
                width:36px;height:36px;border-radius:50%;
                border:1.5px solid #aaa;background:white;
                cursor:pointer;font-size:.85rem;font-weight:700;color:#555;
                display:flex;align-items:center;justify-content:center;
                transition:all .12s;line-height:1;
            }
            .brlp-dot.on{background:#1565c0;border-color:#1565c0;color:white}
            .brlp-dot:hover:not(.on){background:#e3f2fd;border-color:#1565c0;color:#1565c0}
            .brlp-prev{
                font-family:"Apple Braille","Segoe UI Symbol",monospace;
                font-size:2.6rem;color:#1565c0;min-width:42px;text-align:center;line-height:1;
            }
            .brlp-acts{display:flex;flex-direction:column;gap:5px}
            .brlp-acts button{
                padding:4px 10px;border-radius:4px;cursor:pointer;
                font-size:.8em;border:1px solid #aaa;background:#f5f5f5;
            }
            .brlp-insert{background:#1565c0!important;color:#fff!important;border-color:#1565c0!important}
            html[data-theme="dark"] .brlp-panel{background:#1a1d27;border-color:#2e3350;color:#cdd6f4}
            html[data-theme="dark"] .brlp-kbd-btn{background:#1e2133;border-color:#3a3f58;color:#b0bec5}
            html[data-theme="dark"] .brlp-kbd-btn.on{background:#1565c0;color:#fff;border-color:#1565c0}
            html[data-theme="dark"] .brlp-kbd-hint{color:#6b7a99}
            html[data-theme="dark"] .brlp-divider{border-color:#2e3350}
            html[data-theme="dark"] .brlp-grid{background:#11131e;border-color:#2e3350}
            html[data-theme="dark"] .brlp-dot{background:#1a1d27;border-color:#4a4d6a;color:#b0bec5}
            html[data-theme="dark"] .brlp-dot.on{background:#1565c0;border-color:#1565c0;color:white}
            html[data-theme="dark"] .brlp-dot:hover:not(.on){background:#0d2137;border-color:#1565c0;color:#90caf9}
            html[data-theme="dark"] .brlp-prev{color:#90caf9}
            html[data-theme="dark"] .brlp-acts button{background:#1e2133;border-color:#3a3f58;color:#b0bec5}
            @media(max-width:540px){
                .brlp-panel.open{
                    left:8px!important;right:8px!important;
                    bottom:8px!important;top:auto!important;width:auto!important;
                }
            }
        `;
        document.head.appendChild(st);
    }

    // ── 建立浮動面板 ─────────────────────────────────────
    const panel = document.createElement('div');
    panel.className = 'brlp-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'false');
    panel.innerHTML = `
        <div class="brlp-kbd-row">
            <span class="brlp-kbd-label">六點鍵盤</span>
            <button type="button" class="brlp-kbd-btn">關</button>
        </div>
        <div class="brlp-kbd-hint">S=1 D=2 F=3 ｜ J=4 K=5 L=6<br>Space=空白格 ｜ Ctrl+B 切換</div>
        <hr class="brlp-divider">
        <div class="brlp-dot-label">點陣輸入</div>
        <div class="brlp-body">
            <div class="brlp-grid">
                <button type="button" class="brlp-dot" data-dot="1">1</button>
                <button type="button" class="brlp-dot" data-dot="4">4</button>
                <button type="button" class="brlp-dot" data-dot="2">2</button>
                <button type="button" class="brlp-dot" data-dot="5">5</button>
                <button type="button" class="brlp-dot" data-dot="3">3</button>
                <button type="button" class="brlp-dot" data-dot="6">6</button>
            </div>
            <div class="brlp-prev" aria-live="polite">⠀</div>
            <div class="brlp-acts">
                <button type="button" class="brlp-insert">插入</button>
                <button type="button" class="brlp-clear">清點</button>
            </div>
        </div>
    `;
    document.body.appendChild(panel);

    const preview = panel.querySelector('.brlp-prev');
    const kbdBtn  = panel.querySelector('.brlp-kbd-btn');

    // ── 面板定位與開關 ───────────────────────────────────
    function positionPanel() {
        if (window.innerWidth <= 540) return;
        const tb = document.getElementById(opts.triggerId);
        if (!tb) return;
        const r = tb.getBoundingClientRect();
        panel.style.top    = (r.bottom + 6) + 'px';
        panel.style.left   = Math.min(r.left, window.innerWidth - 230) + 'px';
        panel.style.right  = '';
        panel.style.bottom = '';
    }
    function openPanel() {
        positionPanel();
        panel.classList.add('open');
        const tb = document.getElementById(opts.triggerId);
        if (tb) tb.setAttribute('aria-expanded', 'true');
    }
    function closePanel() {
        panel.classList.remove('open');
        const tb = document.getElementById(opts.triggerId);
        if (tb) tb.setAttribute('aria-expanded', 'false');
    }
    document.addEventListener('click', e => {
        const tb = document.getElementById(opts.triggerId);
        if (tb && tb.contains(e.target)) {
            panel.classList.contains('open') ? closePanel() : openPanel();
            return;
        }
        if (!panel.contains(e.target)) closePanel();
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closePanel(); });
    window.addEventListener('resize', () => { if (panel.classList.contains('open')) positionPanel(); });

    // ── 鍵盤模式 ────────────────────────────────────────
    function syncKbdState(on) {
        kbdOn = on;
        kbdBtn.textContent = on ? '開' : '關';
        kbdBtn.classList.toggle('on', on);
        const tb = document.getElementById(opts.triggerId);
        if (tb) tb.classList.toggle('kbd-on', on);
    }

    if (opts.externalKbd) {
        // bt 模式：panel 鍵盤按鈕呼叫外部 toggle，不自行管理 Ctrl+B
        kbdBtn.addEventListener('click', e => {
            e.stopPropagation();
            opts.externalKbd.toggle(!opts.externalKbd.getState());
        });
    } else {
        kbdBtn.addEventListener('click', e => { e.stopPropagation(); syncKbdState(!kbdOn); });

        document.addEventListener('keydown', e => {
            if (!(e.ctrlKey && e.key === 'b')) return;
            const el = document.getElementById(opts.targetId);
            if (!el) return;
            if (!opts.globalToggle && document.activeElement !== el) return;
            if (opts.checkActive && !opts.checkActive()) return;
            syncKbdState(!kbdOn);
            e.preventDefault();
        });

        document.addEventListener('keydown', e => {
            if (!kbdOn) return;
            if (opts.checkActive && !opts.checkActive()) return;
            if (document.activeElement !== document.getElementById(opts.targetId)) return;
            if (e.ctrlKey || e.altKey || e.metaKey) return;
            const PASS = [8,9,13,27,33,34,35,36,37,38,39,40,45,46];
            if (PASS.includes(e.keyCode) || (e.keyCode >= 112 && e.keyCode <= 123)) return;
            if (e.keyCode in KEY_BITS) {
                held[e.keyCode] = true; brlCode |= KEY_BITS[e.keyCode];
                e.preventDefault(); return;
            }
            if (e.keyCode === 32) { doInsert(0); e.preventDefault(); }
        });
        document.addEventListener('keyup', e => {
            if (!kbdOn || !(e.keyCode in KEY_BITS)) return;
            if (document.activeElement !== document.getElementById(opts.targetId)) {
                delete held[e.keyCode];
                if (Object.keys(held).length === 0) brlCode = 0;
                return;
            }
            delete held[e.keyCode];
            if (Object.keys(held).length === 0 && brlCode !== 0) { doInsert(brlCode); brlCode = 0; }
            e.preventDefault();
        });
    }

    // ── 點陣 ────────────────────────────────────────────
    panel.querySelector('.brlp-grid').addEventListener('click', e => {
        const btn = e.target.closest('.brlp-dot');
        if (!btn) return;
        const d = +btn.dataset.dot;
        if (dots.has(d)) { dots.delete(d); btn.classList.remove('on'); }
        else             { dots.add(d);    btn.classList.add('on'); }
        preview.textContent = String.fromCodePoint(0x2800 + [...dots].reduce((b, x) => b | DOT_BITS[x], 0));
    });
    panel.querySelector('.brlp-insert').addEventListener('click', () => {
        doInsert([...dots].reduce((b, x) => b | DOT_BITS[x], 0));
        clearDots();
    });
    panel.querySelector('.brlp-clear').addEventListener('click', clearDots);

    function clearDots() {
        dots.clear();
        panel.querySelectorAll('.brlp-dot').forEach(b => b.classList.remove('on'));
        preview.textContent = '⠀';
    }
    function doInsert(bits) {
        if (typeof opts.insertFn === 'function') {
            opts.insertFn(bits);
        } else {
            const ta = document.getElementById(opts.targetId);
            if (!ta) return;
            const c = String.fromCodePoint(0x2800 + bits);
            const s = ta.selectionStart, ep = ta.selectionEnd;
            ta.value = ta.value.slice(0, s) + c + ta.value.slice(ep);
            ta.selectionStart = ta.selectionEnd = s + 1;
            ta.focus();
        }
        if (typeof opts.onInsert === 'function') opts.onInsert();
    }

    return { syncKbdState, openPanel, closePanel };
}

// ════════════════════════════════════════════════════════════
//  格式調整 Modal — CSS 注入
// ════════════════════════════════════════════════════════════
(function injectModalCSS() {
    if (document.getElementById('shared-modal-css')) return;
    const style = document.createElement('style');
    style.id = 'shared-modal-css';
    style.textContent = `
        /* ── 格式調整 Modal ── */
        #fmt-modal-overlay {
            display: none;
            position: fixed; inset: 0; z-index: 9000;
            background: rgba(0,0,0,0.55);
            align-items: center; justify-content: center;
            padding: 20px;
        }
        #fmt-modal-overlay.open { display: flex; }
        #fmt-modal {
            background: #fff; border-radius: 10px;
            box-shadow: 0 8px 40px rgba(0,0,0,0.28);
            width: 100%; max-width: 700px;
            display: flex; flex-direction: column;
            max-height: 92vh; overflow: hidden;
            animation: fmtSlideIn 0.18s ease;
        }
        @keyframes fmtSlideIn {
            from { transform: translateY(-18px); opacity: 0; }
            to   { transform: none; opacity: 1; }
        }
        #fmt-modal-header {
            display: flex; align-items: center; gap: 8px;
            background: #37474f; color: #fff;
            padding: 12px 18px; border-radius: 10px 10px 0 0; flex-shrink: 0;
        }
        #fmt-modal-header h2 { margin: 0; font-size: 1em; flex: 1; }
        #fmt-modal-header button {
            background: transparent; border: none; color: #fff;
            cursor: pointer; font-size: 0.88em; padding: 4px 8px;
            border-radius: 4px;
        }
        #fmt-modal-header button:hover { background: rgba(255,255,255,0.28); }
        #fmt-tools-bar {
            display: flex; align-items: center; flex-wrap: wrap;
            gap: 6px; padding: 10px 16px;
            background: #f5f5f5; border-bottom: 1px solid #e0e0e0; flex-shrink: 0;
        }
        #fmt-tools-bar .ftb-sep {
            width: 1px; height: 22px; background: #ccc; margin: 0 2px;
        }
        .btn-ftb { padding: 5px 12px !important; font-size: 0.8em !important; white-space: nowrap; color: #fff !important; border: none !important; border-radius: 4px !important; cursor: pointer !important; }
        .btn-ftb-wrap   { background: #5c6bc0 !important; }
        .btn-ftb-wrap:hover { background: #3949ab !important; }
        .btn-ftb-wrap.active { background: #3949ab !important; box-shadow: inset 0 2px 4px rgba(0,0,0,0.2); }
        #fmt-tools-bar .btn-fmt-run { background: #546e7a !important; }
        #fmt-tools-bar .btn-fmt-run:hover { background: #37474f !important; }
        #fmt-tools-bar .btn-fmt-apply { background: #388e3c !important; }
        #fmt-tools-bar .btn-fmt-apply:hover { background: #2e7d32 !important; }
        #fmt-tools-bar .btn-fmt-cancel { background: #90a4ae !important; }
        #fmt-tools-bar .btn-fmt-cancel:hover { background: #607d8b !important; }
        .btn-ftb-undo   { background: #90a4ae !important; }
        .btn-ftb-undo:hover { background: #607d8b !important; }
        #ftb-findbar {
            display: none; align-items: center; flex-wrap: wrap; gap: 6px;
            padding: 8px 16px 10px; background: #f5f5f5;
            border-bottom: 1px solid #e0e0e0; flex-shrink: 0;
        }
        #ftb-findbar.open { display: flex; }
        #ftb-findbar input[type="text"] {
            padding: 5px 8px; border: 1px solid #9fa8da; border-radius: 5px;
            font-size: 0.85em; width: 160px; max-width: 200px;
        }
        #ftb-findbar input:focus { border-color: #3949ab; outline: none; box-shadow: 0 0 0 2px rgba(57,73,171,0.15); }
        #ftb-findbar .ftb-arrow { font-size: 0.8em; color: #7986cb; flex-shrink: 0; }
        .btn-ftb-go    { background: #3949ab !important; padding: 5px 12px !important; font-size: 0.8em !important; }
        .btn-ftb-go:hover { background: #283593 !important; }
        .btn-ftb-close { background: #bdbdbd !important; padding: 5px 9px !important; font-size: 0.8em !important; }
        .btn-ftb-close:hover { background: #9e9e9e !important; }
        #ftb-msg { font-size: 0.78em; color: #388e3c; white-space: nowrap; }
        #adv-replace-overlay {
            display: none; position: fixed; inset: 0; z-index: 9100;
            background: rgba(0,0,0,0.45);
            align-items: center; justify-content: center;
        }
        #adv-replace-overlay.open { display: flex; }
        #adv-replace-modal {
            background: #fff; border-radius: 10px; width: 460px; max-width: 96vw;
            box-shadow: 0 6px 30px rgba(0,0,0,0.22);
            animation: fmtSlideIn 0.15s ease;
        }
        #adv-replace-modal-header {
            display: flex; align-items: center; gap: 8px;
            background: #4527a0; color: #fff;
            padding: 11px 16px; border-radius: 10px 10px 0 0;
        }
        #adv-replace-modal-header h3 { margin: 0; font-size: 1em; flex: 1; }
        #adv-replace-modal-header button {
            background: transparent; border: none; color: #fff;
            cursor: pointer; font-size: 0.88em; padding: 4px 8px; border-radius: 4px;
        }
        #adv-replace-modal-header button:hover { background: rgba(255,255,255,0.28); }
        #adv-tabs { display: flex; border-bottom: 2px solid #e0e0e0; background: #f7f4ff; }
        .adv-tab {
            padding: 8px 12px; background: none; border: none;
            border-bottom: 2px solid transparent; margin-bottom: -2px;
            cursor: pointer; font-size: 0.82em; color: #7e57c2;
        }
        .adv-tab:hover { color: #4527a0; background: #ede7f6; }
        .adv-tab.active { color: #4527a0; border-bottom-color: #4527a0; background: white; }
        #adv-replace-body { padding: 18px 20px; }
        .adv-panel { display: none; }
        .adv-panel.active { display: block; }
        .adv-field { margin-bottom: 12px; }
        .adv-field label {
            display: block; font-size: 0.8em; color: #555; margin-bottom: 4px;
        }
        .adv-field input[type="text"] {
            width: 100%; padding: 6px 9px; border: 1px solid #b39ddb; border-radius: 5px;
            font-size: 0.88em; box-sizing: border-box;
        }
        .adv-field input:focus { border-color: #4527a0; outline: none; box-shadow: 0 0 0 2px rgba(69,39,160,0.15); }
        .adv-desc {
            font-size: 0.76em; color: #888; margin-top: 6px; line-height: 1.5;
        }
        #adv-replace-footer {
            display: flex; align-items: center; gap: 8px;
            padding: 12px 20px; border-top: 1px solid #ede7f6; background: #f7f4ff;
            border-radius: 0 0 10px 10px;
        }
        #adv-replace-footer .btn-adv-run {
            background: #4527a0 !important; padding: 6px 16px !important; font-size: 0.84em !important;
        }
        #adv-replace-footer .btn-adv-run:hover { background: #311b92 !important; }
        #adv-replace-footer .btn-adv-cancel {
            background: #90a4ae !important; padding: 6px 12px !important; font-size: 0.84em !important;
        }
        #adv-replace-footer .btn-adv-undo {
            background: #90a4ae !important; padding: 6px 10px !important; font-size: 0.84em !important;
        }
        #adv-replace-footer .btn-adv-undo:hover { background: #546e7a !important; }
        #adv-msg { font-size: 0.78em; color: #388e3c; flex: 1; }
        #fmt-edit-section { padding: 12px 20px 14px; }
        #fmt-edit-section > .fmt-edit-label {
            display: block; font-size: 0.76em; color: #888; margin-bottom: 6px;
        }
        #fmt-textarea {
            width: 100%; height: 260px; padding: 10px 12px;
            border: 1px solid #90a4ae; border-radius: 6px;
            font-size: 0.9em; font-family: inherit; resize: vertical;
            box-sizing: border-box; line-height: 1.6;
        }
        #fmt-textarea:focus { border-color: #1976d2; outline: none; box-shadow: 0 0 0 2px rgba(25,118,210,0.15); }
        @media (max-width: 600px) {
            #fmt-modal-overlay { padding: 0; align-items: stretch; }
            #fmt-modal { border-radius: 0; max-width: 100%; min-height: 100dvh; }
            #fmt-modal-header { padding: 10px 14px; }
            #fmt-modal-header h2 { font-size: 0.92em; }
            #fmt-tools-bar { padding: 8px 12px; gap: 5px; }
            .ftb-sep { display: none; }
            .btn-ftb { padding: 5px 8px !important; font-size: 0.76em !important; }
            #ftb-findbar { padding: 6px 12px 8px; gap: 5px; }
            #ftb-findbar input[type="text"] { max-width: 130px; font-size: 0.82em; }
            #ftb-msg { display: none; }
            #fmt-edit-section { padding: 8px 12px 10px; }
            #fmt-textarea { height: 200px; padding: 8px; }
            #adv-replace-modal { border-radius: 0; width: 100%; max-width: 100%; }
            #adv-replace-overlay { align-items: flex-end; }
            #adv-replace-body { padding: 12px 14px; }
            #adv-replace-footer { padding: 8px 14px; }
            .adv-tab { padding: 7px 8px; font-size: 0.75em; }
        }
        #fmt-wrap-panel { display: none; background: #fafafa; border-bottom: 1px solid #e0e0e0; flex-shrink: 0; }
        #fmt-wrap-panel.open { display: block; }
        #fmt-wrap-header {
            display: flex; align-items: center; gap: 8px;
            padding: 8px 16px; background: #eceff1; border-bottom: 1px solid #e0e0e0;
        }
        #fmt-wrap-controls {
            display: flex; align-items: center; gap: 6px; flex-wrap: wrap; flex: 1;
        }
        .fwp-ctrl-label { font-size: 0.78em; color: #555; white-space: nowrap; }
        #fwp-mode-btns { display: flex; gap: 3px; flex-wrap: wrap; }
        .fwp-mode-btn {
            background: #546e7a !important; color: #fff !important;
            border: none !important; border-radius: 4px !important;
            padding: 3px 9px !important; font-size: 0.76em !important; cursor: pointer !important;
        }
        .fwp-mode-btn:hover { background: #607d8b !important; }
        .fwp-mode-btn.active { background: #2e7d32 !important; font-weight: bold !important; }
        .fwp-mode-all { background: #6a1b9a !important; }
        .fwp-mode-all:hover { background: #4a148c !important; }
        .fwp-mode-all.active { background: #4a148c !important; font-weight: bold !important; }
        #fmt-wrap-legend {
            display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
            padding: 5px 16px; font-size: 0.76em; color: #555;
            border-bottom: 1px solid #e0e0e0;
        }
        .fwl-item { display: flex; align-items: center; gap: 4px; }
        .fwl-dot {
            width: 12px; height: 12px; border-radius: 2px; border: 1px solid;
            display: inline-block;
        }
        .fwl-hint { color: #999; font-style: italic; }
        #fmt-wrap-preview {
            max-height: 220px; overflow-y: auto; padding: 10px 16px;
            font-size: 14px; line-height: 1.7; white-space: pre-wrap;
            font-family: inherit;
        }
        .fwp-newline-keep {
            display: inline-block; background: #e8f5e9; border: 1px solid #4caf50;
            border-radius: 3px; padding: 0 3px; margin: 1px; cursor: pointer;
            white-space: pre-wrap;
        }
        .fwp-newline-keep:hover { background: #c8e6c9; }
        .fwp-newline-merge {
            display: inline-block; background: #fff3e0; border: 1px solid #ff9800;
            border-radius: 3px; padding: 0 3px; margin: 1px; cursor: pointer;
            white-space: pre-wrap;
        }
        .fwp-newline-merge:hover { background: #ffe0b2; }
        .fwp-newline-merge-len {
            display: inline-block; background: #fff9c4; border: 1px solid #f9a825;
            border-radius: 3px; padding: 0 3px; margin: 1px; cursor: pointer;
            white-space: pre-wrap;
        }
        .fwp-newline-merge-len:hover { background: #fff176; }
        .fwp-blankline {
            display: block; height: 0.5em; width: 100%;
        }
        /* bt-only 按鈕預設隱藏，bt 自己 show */
        .shared-bt-only { display: none !important; }
        /* Dark theme support for modal */
        html[data-theme="dark"] #fmt-modal,
        html:not([data-theme]) #fmt-modal {
            background: #1e2130;
        }
        html[data-theme="dark"] #fmt-modal-header,
        html:not([data-theme]) #fmt-modal-header {
            background: #2c3145;
        }
        html[data-theme="dark"] #fmt-tools-bar,
        html[data-theme="dark"] #ftb-findbar,
        html:not([data-theme]) #fmt-tools-bar,
        html:not([data-theme]) #ftb-findbar {
            background: #252839;
            border-color: #363a52;
        }
        html[data-theme="dark"] #fmt-textarea,
        html:not([data-theme]) #fmt-textarea {
            background: #1a1d2e;
            border-color: #363a52;
            color: #eef2f9;
        }
        html[data-theme="dark"] #fmt-wrap-panel,
        html:not([data-theme]) #fmt-wrap-panel {
            background: #1e2130;
            border-color: #363a52;
        }
        html[data-theme="dark"] #fmt-wrap-header,
        html[data-theme="dark"] #fmt-wrap-legend,
        html:not([data-theme]) #fmt-wrap-header,
        html:not([data-theme]) #fmt-wrap-legend {
            background: #252839;
            border-color: #363a52;
        }
        html[data-theme="dark"] #adv-replace-modal,
        html:not([data-theme]) #adv-replace-modal {
            background: #1e2130;
        }
        html[data-theme="dark"] #adv-replace-footer,
        html[data-theme="dark"] #adv-tabs,
        html:not([data-theme]) #adv-replace-footer,
        html:not([data-theme]) #adv-tabs {
            background: #252839;
            border-color: #363a52;
        }
        html[data-theme="dark"] .adv-field input[type="text"],
        html:not([data-theme]) .adv-field input[type="text"] {
            background: #1a1d2e;
            border-color: #363a52;
            color: #eef2f9;
        }
        html[data-theme="dark"] .adv-field label,
        html[data-theme="dark"] .adv-desc,
        html[data-theme="dark"] .fmt-edit-label,
        html:not([data-theme]) .adv-field label,
        html:not([data-theme]) .adv-desc,
        html:not([data-theme]) .fmt-edit-label {
            color: #a9b3c9;
        }
        html[data-theme="dark"] #ftb-findbar input[type="text"],
        html:not([data-theme]) #ftb-findbar input[type="text"] {
            background: #1a1d2e;
            border-color: #363a52;
            color: #eef2f9;
        }
        html[data-theme="dark"] #fmt-wrap-preview,
        html:not([data-theme]) #fmt-wrap-preview {
            background: #1a1d2e;
            color: #eef2f9;
        }

    `;
    document.head.appendChild(style);
})();

// ════════════════════════════════════════════════════════════
//  格式調整 Modal — HTML 注入
// ════════════════════════════════════════════════════════════
(function injectModalHTML() {
    function _doInject() {
        if (document.getElementById('fmt-modal-overlay')) return;
        const div = document.createElement('div');
        div.innerHTML = `
    <div id="fmt-modal-overlay" role="dialog" aria-modal="true" aria-label="格式調整視窗" onclick="fmtOverlayClick(event)">
        <div id="fmt-modal">
            <div id="fmt-modal-header">
                <h2>📋 格式調整</h2>
                <button onclick="closeFmtModal()" aria-label="關閉">✕ 關閉</button>
            </div>
            <div id="fmt-tools-bar">
                <button class="btn-ftb btn-fmt-run" onclick="fmtRunClean()" title="自動整理試卷格式、中英加空格、清除答題框等">✨ 自動調整</button>
                <button class="btn-ftb btn-ftb-wrap" onclick="openWrapPanel()" title="分析並互動式預覽哪些換行可以合併">↵ 合併換行…</button>
                <button class="btn-ftb shared-bt-only" id="btn-ftb-braille" onclick="fmtToggleBrailleInput()" title="切換點字六點直接輸入模式（Ctrl+B）" style="background:#5c6bc0!important;">⠿ 點字輸入</button>
                <div class="ftb-sep"></div>
                <button class="btn-ftb" id="btn-ftb-replace" style="background:#1976d2!important;" onclick="ftbToggleFindbar()" title="搜尋並取代文字">🔍 取代</button>
                <button class="btn-ftb" style="background:#6a1b9a!important;" onclick="openAdvReplace()" title="替換頭尾、刪除包圍內容等進階功能">✦ 進階</button>
                <div class="ftb-sep"></div>
                <button class="btn-ftb btn-ftb-undo" onclick="fmtUndo()" title="復原上一步">↩</button>
                <div style="flex:1;"></div>
                <button class="btn-ftb btn-fmt-apply" onclick="fmtApplyAndClose()" title="套用內容並關閉">✔ 套用</button>
                <button class="btn-ftb btn-fmt-cancel" onclick="closeFmtModal()" title="捨棄變更並關閉">✕ 取消</button>
            </div>
            <div id="ftb-findbar">
                <input type="text" id="ftb-find" placeholder="搜尋…" aria-label="搜尋文字">
                <span class="ftb-arrow">→</span>
                <input type="text" id="ftb-replace" placeholder="取代為（空白＝刪除）" aria-label="取代文字">
                <button class="btn-ftb-go" onclick="ftbSimpleReplace()">取代</button>
                <span id="ftb-msg"></span>
                <button class="btn-ftb-close" onclick="ftbToggleFindbar()" aria-label="關閉取代列">✕</button>
            </div>
            <div id="fmt-wrap-panel">
                <div id="fmt-wrap-header">
                    <span style="font-weight:bold;font-size:0.88em;white-space:nowrap;">🔍 合併強制換行</span>
                    <div id="fmt-wrap-controls">
                        <div id="fwp-mode-btns" role="group" aria-label="合併模式">
                            <button class="fwp-mode-btn" data-mode="conservative" onclick="fwpSetMode(this)">保守</button>
                            <button class="fwp-mode-btn active" data-mode="standard" onclick="fwpSetMode(this)">標準</button>
                            <button class="fwp-mode-btn" data-mode="aggressive" onclick="fwpSetMode(this)">積極</button>
                            <button class="fwp-mode-btn fwp-mode-all" data-mode="all" onclick="fwpSetMode(this)" title="移除所有換行，整份文字合成一行">全部合併</button>
                        </div>
                        <span id="fwp-linelen-wrap" style="display:flex;align-items:center;gap:4px;">
                            <label class="fwp-ctrl-label" for="fwp-linelen">行長：</label>
                            <input type="number" id="fwp-linelen" value="25" min="5" max="80" oninput="fwpRefresh()" style="width:48px;padding:3px 5px;border:1px solid #ccc;border-radius:4px;font-size:0.82em;" title="字元數閾值（積極模式用）">
                        </span>
                        <button class="btn-ftb" style="background:#388e3c!important;" onclick="fwpApply()">✔ 套用</button>
                        <button class="btn-ftb btn-ftb-undo" onclick="closeWrapPanel()" title="取消，不做變更">✕</button>
                    </div>
                </div>
                <div id="fmt-wrap-legend">
                    <span class="fwl-item"><span class="fwl-dot" style="background:#e8f5e9;border-color:#4caf50;"></span>保留</span>
                    <span class="fwl-item"><span class="fwl-dot" style="background:#fff3e0;border-color:#ff9800;"></span>合併（標點）</span>
                    <span class="fwl-item"><span class="fwl-dot" style="background:#fff9c4;border-color:#f9a825;"></span>合併（行長）</span>
                    <span class="fwl-item fwl-hint">點擊標籤可手動切換</span>
                    <span id="fwp-stat" style="margin-left:auto;font-size:0.78em;color:#888;"></span>
                </div>
                <div id="fmt-wrap-preview" aria-label="換行合併預覽" tabindex="0"></div>
            </div>
            <div id="fmt-edit-section">
                <span class="fmt-edit-label">✏️ 預覽 / 手動編輯（完成後按「套用並關閉」）</span>
                <textarea id="fmt-textarea" spellcheck="false"></textarea>
            </div>
        </div>
    </div>

    <div id="adv-replace-overlay" role="dialog" aria-modal="true" aria-label="進階取代" onclick="advOverlayClick(event)">
        <div id="adv-replace-modal">
            <div id="adv-replace-modal-header">
                <h3>✦ 進階取代</h3>
                <button onclick="closeAdvReplace()" aria-label="關閉">✕</button>
            </div>
            <div id="adv-tabs" role="tablist">
                <button class="adv-tab active" role="tab" data-panel="adv-p-replace" onclick="advSwitchTab(this)">單一取代</button>
                <button class="adv-tab" role="tab" data-panel="adv-p-startend" onclick="advSwitchTab(this)">替換頭尾</button>
                <button class="adv-tab" role="tab" data-panel="adv-p-del-enc" onclick="advSwitchTab(this)">刪除包圍內容</button>
                <button class="adv-tab" role="tab" data-panel="adv-p-del-mid" onclick="advSwitchTab(this)">刪除中間</button>
            </div>
            <div id="adv-replace-body">
                <div id="adv-p-replace" class="adv-panel active">
                    <div class="adv-field">
                        <label>搜尋文字</label>
                        <input type="text" id="adv-find" placeholder="要尋找的文字">
                    </div>
                    <div class="adv-field">
                        <label>取代為（空白＝刪除）</label>
                        <input type="text" id="adv-rep" placeholder="取代後的文字">
                    </div>
                    <div class="adv-desc">支援純文字取代，區分大小寫。</div>
                </div>
                <div id="adv-p-startend" class="adv-panel">
                    <div class="adv-field">
                        <label>原始開頭文字</label>
                        <input type="text" id="adv-se-os" placeholder="每行原來的開頭">
                    </div>
                    <div class="adv-field">
                        <label>取代開頭為</label>
                        <input type="text" id="adv-se-ns" placeholder="新的開頭（空白＝刪除）">
                    </div>
                    <div class="adv-field">
                        <label>原始結尾文字</label>
                        <input type="text" id="adv-se-oe" placeholder="每行原來的結尾">
                    </div>
                    <div class="adv-field">
                        <label>取代結尾為</label>
                        <input type="text" id="adv-se-ne" placeholder="新的結尾（空白＝刪除）">
                    </div>
                    <div class="adv-desc">只處理符合條件的行，其他行保留不動。</div>
                </div>
                <div id="adv-p-del-enc" class="adv-panel">
                    <div class="adv-field">
                        <label>包圍開頭</label>
                        <input type="text" id="adv-de-pre" placeholder="例如 【">
                    </div>
                    <div class="adv-field">
                        <label>包圍結尾</label>
                        <input type="text" id="adv-de-suf" placeholder="例如 】">
                    </div>
                    <div class="adv-desc">刪除所有在「開頭」與「結尾」之間的內容（含標記本身）。</div>
                </div>
                <div id="adv-p-del-mid" class="adv-panel">
                    <div class="adv-field">
                        <label>前段結尾</label>
                        <input type="text" id="adv-dm-pre" placeholder="例如 第">
                    </div>
                    <div class="adv-field">
                        <label>後段開頭</label>
                        <input type="text" id="adv-dm-suf" placeholder="例如 題">
                    </div>
                    <div class="adv-desc">刪除「前段結尾」與「後段開頭」之間的文字（保留兩端標記）。</div>
                </div>
            </div>
            <div id="adv-replace-footer">
                <span id="adv-msg"></span>
                <button class="btn-adv-undo" onclick="fmtUndo()">↩ 復原</button>
                <button class="btn-adv-cancel" onclick="closeAdvReplace()">取消</button>
                <button class="btn-adv-run" onclick="advExecute()">▶ 執行</button>
            </div>
        </div>
    </div>`;
        document.body.appendChild(div.firstElementChild);
        document.body.appendChild(div.firstElementChild);
    }
    if (document.body) { _doInject(); }
    else { document.addEventListener('DOMContentLoaded', _doInject); }
})();

// ════════════════════════════════════════════════════════════
//  格式調整 Modal — JS（IIFE，參數化 taId 和 getOpts）
//  openFormatModal(taId, onApply, getOpts)
//    taId:     來源/目標 textarea id
//    onApply:  套用後 callback（可為 null）
//    getOpts:  回傳 cleanExamText opts 的函式（null = 全開）
// ════════════════════════════════════════════════════════════
(function() {
    var _undoStack = [];
    var _origSnapshot = '';
    var _applied = false;
    var _targetTA = null;     // 目前開啟 modal 對應的 textarea id
    var _onApply  = null;     // 套用後 callback
    var _getOpts  = null;     // opts getter

    function pushUndo() {
        var ta = document.getElementById('fmt-textarea');
        _undoStack.push(ta.value);
        if (_undoStack.length > 30) _undoStack.shift();
    }

    window.fmtUndo = function() {
        if (_undoStack.length === 0) { showFtbMsg('沒有可復原的操作'); return; }
        var ta = document.getElementById('fmt-textarea');
        ta.value = _undoStack.pop();
        showFtbMsg('已復原');
        showAdvMsg('已復原');
    };

    function isDirty() {
        var ta = document.getElementById('fmt-textarea');
        return ta && ta.value !== _origSnapshot;
    }

    function showFtbMsg(msg) {
        var el = document.getElementById('ftb-msg');
        if (el) { el.textContent = msg; setTimeout(() => { if (el.textContent === msg) el.textContent = ''; }, 2500); }
    }
    function showAdvMsg(msg) {
        var el = document.getElementById('adv-msg');
        if (el) { el.textContent = msg; setTimeout(() => { if (el.textContent === msg) el.textContent = ''; }, 2500); }
    }

    // ── 合併換行面板 ──
    var _fwpMode = 'standard';
    var _fwpDecisions = [];

    window.fwpSetMode = function(btn) {
        _fwpMode = btn.dataset.mode;
        document.querySelectorAll('.fwp-mode-btn').forEach(b => b.classList.toggle('active', b === btn));
        fwpRefresh();
    };

    window.fwpRefresh = function() {
        var ta = document.getElementById('fmt-textarea');
        if (!ta) return;
        var lines = ta.value.split('\n');
        var threshold = parseInt(document.getElementById('fwp-linelen').value) || 25;
        _fwpDecisions = [];

        var preview = document.getElementById('fmt-wrap-preview');
        if (!preview) return;
        preview.innerHTML = '';

        var mergeCount = 0;
        for (var i = 0; i < lines.length; i++) {
            var line = lines[i];
            var nextLine = lines[i + 1];
            var decision = 'keep';

            if (i < lines.length - 1) {
                if (_fwpMode === 'all') {
                    decision = line.trim() === '' ? 'keep' : 'merge';
                } else {
                    var endsNoPunct = line.length > 0 && !/[。？！…、，,.:!?\s]$/.test(line);
                    var nextNotBlank = nextLine && nextLine.trim() !== '';
                    var nextNotSect  = nextLine && !/^[一二三四五六七八九十\d]/.test(nextLine.trim());
                    var nextNotOpt   = nextLine && !/^\([A-D]\)/.test(nextLine.trim());

                    if (_fwpMode === 'conservative') {
                        decision = (endsNoPunct && nextNotBlank && nextNotSect && nextNotOpt &&
                                    /[a-zA-Z\u4e00-\u9fff]$/.test(line)) ? 'merge' : 'keep';
                    } else if (_fwpMode === 'standard') {
                        decision = (endsNoPunct && nextNotBlank && nextNotSect && nextNotOpt) ? 'merge' : 'keep';
                    } else if (_fwpMode === 'aggressive') {
                        decision = (line.trim() !== '' && nextNotBlank && nextNotSect && nextNotOpt &&
                                    line.length < threshold) ? 'merge-len' : (
                                   (endsNoPunct && nextNotBlank && nextNotSect && nextNotOpt) ? 'merge' : 'keep');
                    }
                }
            }

            if (decision !== 'keep' && line.trim() !== '') mergeCount++;
            _fwpDecisions.push(decision);

            var span = document.createElement('span');
            if (line.trim() === '' && decision === 'keep') {
                span.className = 'fwp-blankline';
            } else {
                span.className = decision === 'keep'     ? 'fwp-newline-keep' :
                                 decision === 'merge-len' ? 'fwp-newline-merge-len' : 'fwp-newline-merge';
                span.textContent = line || ' ';
                var tag = document.createElement('span');
                tag.textContent = decision === 'keep' ? ' ↵保留' : ' ↵合併';
                tag.style.cssText = 'font-size:0.72em;padding:1px 5px;border-radius:3px;margin-left:4px;vertical-align:middle;font-weight:600;background:' + (decision==='keep'?'#4caf50':'#ff9800') + ';color:#fff;';
                span.appendChild(tag);
                span.dataset.idx = i;
                span.title = decision === 'keep' ? '保留換行（點擊切換）' : '將合併到下一行（點擊切換）';
                span.addEventListener('click', fwpToggle);
            }
            preview.appendChild(span);
            if (decision === 'keep') preview.appendChild(document.createTextNode('\n'));
        }

        var stat = document.getElementById('fwp-stat');
        if (stat) stat.textContent = mergeCount > 0 ? '將合併 ' + mergeCount + ' 個換行' : '無需合併';
    };

    function fwpToggle(e) {
        var idx = parseInt(e.currentTarget.dataset.idx);
        if (_fwpDecisions[idx] === 'keep') {
            _fwpDecisions[idx] = 'merge';
        } else {
            _fwpDecisions[idx] = 'keep';
        }
        var span = e.currentTarget;
        span.className = _fwpDecisions[idx] === 'keep' ? 'fwp-newline-keep' : 'fwp-newline-merge';
        span.title = _fwpDecisions[idx] === 'keep' ? '保留換行（點擊切換）' : '將合併到下一行（點擊切換）';
        var existingTag = span.querySelector('span');
        if (existingTag) {
            existingTag.textContent = _fwpDecisions[idx] === 'keep' ? ' ↵保留' : ' ↵合併';
            existingTag.style.background = _fwpDecisions[idx] === 'keep' ? '#4caf50' : '#ff9800';
        }
        var stat = document.getElementById('fwp-stat');
        var mergeCount = _fwpDecisions.filter(d => d !== 'keep').length;
        if (stat) stat.textContent = mergeCount > 0 ? '將合併 ' + mergeCount + ' 個換行' : '無需合併';
    }

    window.fwpApply = function() {
        var ta = document.getElementById('fmt-textarea');
        if (!ta) return;
        pushUndo();
        var lines = ta.value.split('\n');
        var result = [];
        for (var i = 0; i < lines.length; i++) {
            if (_fwpDecisions[i] && _fwpDecisions[i] !== 'keep' && i < lines.length - 1) {
                result.push(lines[i] + (lines[i].trim() && lines[i+1].trim() ? '' : ''));
                lines[i+1] = (lines[i] + lines[i+1]).trim() ? lines[i] + lines[i+1] : lines[i+1];
                // 直接合併：當前行加上下一行
                result[result.length - 1] = lines[i];
                lines[i + 1] = lines[i] + lines[i + 1];
                // 簡化：累積到下一行
                continue;
            }
            result.push(lines[i]);
        }
        // 重新做一次正確合併
        var lines2 = ta.value.split('\n');
        var out = '';
        for (var j = 0; j < lines2.length; j++) {
            if (_fwpDecisions[j] && _fwpDecisions[j] !== 'keep' && j < lines2.length - 1) {
                out += lines2[j];
            } else {
                out += lines2[j] + (j < lines2.length - 1 ? '\n' : '');
            }
        }
        ta.value = out;
        window._fwpLastDecisions = _fwpDecisions.slice(); // 供呼叫端反推輸入
        showFtbMsg('已套用合併');
        closeWrapPanel();
    };

    window.openWrapPanel = function() {
        var panel = document.getElementById('fmt-wrap-panel');
        if (!panel) return;
        if (panel.classList.contains('open')) { closeWrapPanel(); return; }
        var btn = document.querySelector('.btn-ftb-wrap');
        if (btn) btn.classList.add('active');
        panel.classList.add('open');
        fwpRefresh();
    };

    window.closeWrapPanel = function() {
        var panel = document.getElementById('fmt-wrap-panel');
        if (panel) panel.classList.remove('open');
        var btn = document.querySelector('.btn-ftb-wrap');
        if (btn) btn.classList.remove('active');
    };

    // ── 取代 findbar ──
    window.ftbToggleFindbar = function() {
        var bar = document.getElementById('ftb-findbar');
        if (!bar) return;
        var opening = !bar.classList.contains('open');
        bar.classList.toggle('open');
        if (opening) {
            setTimeout(function() {
                var f = document.getElementById('ftb-find');
                if (f) { f.focus(); f.select(); }
            }, 60);
            var fi = document.getElementById('ftb-find');
            if (fi) fi.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') { e.preventDefault(); ftbSimpleReplace(); }
            }, { once: false });
        }
    };

    window.ftbSimpleReplace = function() {
        var findVal    = (document.getElementById('ftb-find')    || {}).value || '';
        var replaceVal = (document.getElementById('ftb-replace') || {}).value || '';
        if (!findVal) { showFtbMsg('請輸入搜尋文字'); return; }
        var ta = document.getElementById('fmt-textarea');
        if (!ta) return;
        pushUndo();
        var orig = ta.value;
        var escaped = findVal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        var count = (orig.match(new RegExp(escaped, 'g')) || []).length;
        if (count === 0) { showFtbMsg('找不到符合的文字'); return; }
        ta.value = orig.replace(new RegExp(escaped, 'g'), replaceVal);
        showFtbMsg('已取代 ' + count + ' 處');
    };

    function escRe(s) {
        return (s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    // ── 主 Modal 開關 ──
    window.openFormatModal = function(taId, onApply, getOpts, modalOpts) {
        _targetTA = taId || 'input-text';
        _onApply  = onApply  || null;
        _getOpts  = getOpts  || null;
        window._fwpLastDecisions = null;
        var src = (document.getElementById(_targetTA) || {}).value || '';
        var fmtTA = document.getElementById('fmt-textarea');
        if (!fmtTA) return;
        fmtTA.value = src;
        _origSnapshot = src;
        _applied = false;
        _undoStack = [];
        var bar = document.getElementById('ftb-findbar');
        if (bar) bar.classList.remove('open');
        var fi = document.getElementById('ftb-find');
        var fr = document.getElementById('ftb-replace');
        var fm = document.getElementById('ftb-msg');
        if (fi) fi.value = '';
        if (fr) fr.value = '';
        if (fm) fm.textContent = '';
        closeWrapPanel();
        var btnAuto = document.querySelector('.btn-fmt-run');
        if (btnAuto) btnAuto.style.display = (modalOpts && modalOpts.noAutoClean) ? 'none' : '';
        var overlay = document.getElementById('fmt-modal-overlay');
        if (overlay) overlay.classList.add('open');
        setTimeout(function() { if (fmtTA) fmtTA.focus(); }, 80);
    };

    function _doClose() {
        var overlay = document.getElementById('fmt-modal-overlay');
        if (overlay) overlay.classList.remove('open');
        var btnAuto = document.querySelector('.btn-fmt-run');
        if (btnAuto) btnAuto.style.display = ''; // 還原，不影響其他工具
        closeWrapPanel();
    }

    window.closeFmtModal = function(force) {
        if (!force && isDirty()) {
            if (!confirm('內容已修改但尚未套用，確定要放棄變更並關閉嗎？')) return;
        }
        _doClose();
    };

    window.fmtOverlayClick = function(e) {
        if (e.target === document.getElementById('fmt-modal-overlay')) closeFmtModal();
    };

    window.fmtRunClean = function() {
        pushUndo();
        var ta = document.getElementById('fmt-textarea');
        if (!ta) return;
        var opts = (typeof _getOpts === 'function') ? _getOpts() : null;
        ta.value = cleanExamText(ta.value, opts);
        showFtbMsg('自動調整完成');
    };

    window.fmtApplyAndClose = function() {
        var result = (document.getElementById('fmt-textarea') || {}).value;
        var target = document.getElementById(_targetTA);
        if (target) target.value = result;
        _applied = true;
        if (typeof _onApply === 'function') _onApply();
        _doClose();
    };

    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            var advOpen = (document.getElementById('adv-replace-overlay') || {}).classList;
            if (advOpen && advOpen.contains('open')) { closeAdvReplace(); return; }
            var fmtOpen = (document.getElementById('fmt-modal-overlay') || {}).classList;
            if (fmtOpen && fmtOpen.contains('open')) { closeFmtModal(); return; }
        }
    });

    // ── 進階取代 ──
    if (!window.openAdvReplace) window.openAdvReplace = function() {
        var o = document.getElementById('adv-replace-overlay');
        if (o) o.classList.add('open');
    };
    if (!window.closeAdvReplace) window.closeAdvReplace = function() {
        var o = document.getElementById('adv-replace-overlay');
        if (o) o.classList.remove('open');
    };
    window.advOverlayClick = function(e) {
        if (e.target === document.getElementById('adv-replace-overlay')) closeAdvReplace();
    };
    if (!window.advSwitchTab) window.advSwitchTab = function(btn) {
        document.querySelectorAll('.adv-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.adv-panel').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        var panel = document.getElementById(btn.dataset.panel);
        if (panel) panel.classList.add('active');
    };

    if (!window.advExecute) window.advExecute = function() {
        var ta = document.getElementById('fmt-textarea');
        if (!ta) return;
        var activeTab = document.querySelector('.adv-tab.active');
        var panelId = activeTab ? activeTab.dataset.panel : '';
        var text = ta.value;
        var count = 0;

        pushUndo();

        if (panelId === 'adv-p-replace') {
            var find = (document.getElementById('adv-find') || {}).value || '';
            var rep  = (document.getElementById('adv-rep')  || {}).value || '';
            if (!find) { showAdvMsg('請輸入搜尋文字'); return; }
            var escaped = find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            count = (text.match(new RegExp(escaped, 'g')) || []).length;
            text = text.replace(new RegExp(escaped, 'g'), rep);
            showAdvMsg(count > 0 ? '已取代 ' + count + ' 處' : '找不到符合的文字');

        } else if (panelId === 'adv-p-startend') {
            var os = (document.getElementById('adv-se-os') || {}).value || '';
            var ns = (document.getElementById('adv-se-ns') || {}).value || '';
            var oe = (document.getElementById('adv-se-oe') || {}).value || '';
            var ne = (document.getElementById('adv-se-ne') || {}).value || '';
            text = text.split('\n').map(function(line) {
                var l = line;
                if (os && l.startsWith(os)) { l = ns + l.slice(os.length); count++; }
                if (oe && l.endsWith(oe))   { l = l.slice(0, l.length - oe.length) + ne; count++; }
                return l;
            }).join('\n');
            showAdvMsg(count > 0 ? '已處理 ' + count + ' 處' : '找不到符合條件的行');

        } else if (panelId === 'adv-p-del-enc') {
            var pre = (document.getElementById('adv-de-pre') || {}).value || '';
            var suf = (document.getElementById('adv-de-suf') || {}).value || '';
            if (!pre || !suf) { showAdvMsg('請輸入包圍開頭和結尾'); return; }
            var re = new RegExp(escRe(pre) + '[\\s\\S]*?' + escRe(suf), 'g');
            count = (text.match(re) || []).length;
            text = text.replace(re, '');
            showAdvMsg(count > 0 ? '已刪除 ' + count + ' 處包圍內容' : '找不到符合範圍');

        } else if (panelId === 'adv-p-del-mid') {
            var dpre = (document.getElementById('adv-dm-pre') || {}).value || '';
            var dsuf = (document.getElementById('adv-dm-suf') || {}).value || '';
            if (!dpre || !dsuf) { showAdvMsg('請輸入前段結尾和後段開頭'); return; }
            var re2 = new RegExp('(' + escRe(dpre) + ')[\\s\\S]*?(' + escRe(dsuf) + ')', 'g');
            count = (text.match(re2) || []).length;
            text = text.replace(re2, '$1$2');
            showAdvMsg(count > 0 ? '已清空 ' + count + ' 處中間內容' : '找不到符合範圍');
        }

        ta.value = text;
    };

    // bt-only 點字輸入按鈕（shared.js 不實作，bt 自己 override）
    if (!window.fmtToggleBrailleInput) {
        window.fmtToggleBrailleInput = function() {};
    }

})();
