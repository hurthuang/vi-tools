// 算式編輯器（一個算式）：符號按鈕、預覽、Nemeth 點字、念法（MathCAT）
//   按鈕與報讀名稱取自數學點字頁（nemeth_converter.html）數學編輯器的算式部分；整份文件用的功能（打開 TXT、試卷調整、取代…）不放。
//   window.vitoolsMathEditor.open({ tex, title, onApply(tex), onCancel() })：<dialog> 對話框
//     Ctrl＋Enter 套用、Esc 取消；關掉後焦點回到原本的地方
//   點字：第一次打開時在隱藏的 iframe 載入數學點字頁，用它的 latexToNemethAsc（同文字轉點字的做法）
//   念法：math-speech.js 的 vitoolsMathSpeech（沒載入就自己載）
(function () {
  'use strict';
  // [顯示, 插入的 LaTeX, 報讀名稱]；插入的內容有 {} 時游標放在第一個 {} 裡（選了字就包進去）
  const GROUPS = [
    ['層次', [
      ['分數', '\\frac{}{}', '分數 \\frac{分子}{分母}'], ['xⁿ', '^{}', '上標／指數'], ['xₙ', '_{}', '下標'],
      ['√x', '\\sqrt{}', '根號'], ['∛x', '\\sqrt[n]{}', 'n 次方根'],
      ['縮寫', '\\text{}', '英文縮寫、單位 \\text{…}（單位符號如 m、g、s 一定要包這個才會補英文字母指示符）'],
      ['聯立方程式', '\\begin{cases} {} &{} \\\\ {} &{} \\end{cases}', '聯立方程式'],
      ['Σ', '\\sum\\limits_{}^{}', '總和'], ['lim', '\\lim\\limits_{{} \\to {}}', '極限'], ['log', '\\log_{}', '對數'],
      ['矩陣', '\\left [ \\begin{matrix} {} &{} \\\\ {} &{} \\end{matrix} \\right ]', '矩陣'],
      ['行列式', '\\begin{vmatrix} {} &{} \\\\ {} &{} \\end{vmatrix}', '行列式'],
    ]],
    ['運算符號', [
      ['×', '\\times ', '乘號'], ['÷', '\\div ', '除號'], ['±', '\\pm ', '加減、正負'],
      ['比', '\\ratio ', '比號'], ['比例', '\\proportion ', '比例號'],
    ]],
    ['關係符號', [
      ['≤', '\\le ', '小於等於'], ['≥', '\\ge ', '大於等於'], ['≠', '\\ne ', '不等於'], ['≈', '\\approx ', '約等於'],
      ['≒', '\\fallingdotseq ', '近似於'], ['≅', '\\cong ', '全等'], ['∼', '\\sim ', '相似'], ['∥', '\\parallel ', '平行'], ['⊥', '\\perp ', '垂直'],
    ]],
    ['幾何', [
      ['∠', '\\angle ', '角'], ['△', '\\triangle ', '三角形'], ['線段', '\\overline{}', '線段'], ['射線', '\\overrightarrow{}', '射線'],
      ['直線', '\\overleftrightarrow{}', '直線'], ['弧', '\\overset{\\frown}{}', '弧'], ['向量', '\\vec{}', '向量'],
    ]],
    ['常用符號', [
      ['∵', '\\because ', '因為'], ['∴', '\\therefore ', '所以'], ['°', '^{\\circ}', '度'], ['π', '\\pi ', '圓周率'], ['∞', '\\infty ', '無限'],
      ['∩', '\\cap ', '交集'], ['∪', '\\cup ', '聯集'], ['%', '\\% ', '百分率'], ['‰', '‰ ', '千分率'],
      ['{ }', '\\{ \\}', '大括號'], ['|x|', '|{}|', '絕對值'], ['化學式', '\\ce{}', '化學式 \\ce{…}（元素符號連在一起時一定要包，例如 HNO3、CaCl2）'],
    ]],
  ];
  const GREEK = 'alpha α beta β gamma γ delta δ epsilon ε zeta ζ eta η theta θ iota ι kappa κ lambda λ mu μ nu ν xi ξ omicron ο pi π rho ρ sigma σ tau τ upsilon υ phi φ chi χ psi ψ omega ω';
  const SELECTS = [
    ['希臘字母', [['小寫', pairs(GREEK).map(([n, c]) => ['\\' + n + ' ', c])],
      ['大寫', pairs(GREEK).map(([n, c]) => ['\\' + n[0].toUpperCase() + n.slice(1) + ' ', c.toUpperCase()])]]],
    ['三角函數', [['', 'sin cos tan csc sec cot arcsin arccos arctan sinh cosh tanh'.split(' ').map(f => ['\\' + f + ' ', f])]]],
    ['其他符號', [
      ['箭頭', [['\\rightarrow ', '→ 右箭頭'], ['\\leftarrow ', '← 左箭頭'], ['\\leftrightarrow ', '↔ 雙向箭頭'], ['\\Rightarrow ', '⇒ 雙線右箭頭'],
        ['\\Leftarrow ', '⇐ 雙線左箭頭'], ['\\Leftrightarrow ', '⇔ 雙線雙向箭頭'], ['\\uparrow ', '↑ 上箭頭'], ['\\downarrow ', '↓ 下箭頭']]],
      ['集合', [['\\in ', '∈ 屬於'], ['\\notin ', '∉ 不屬於'], ['\\subset ', '⊂ 真子集'], ['\\supset ', '⊃ 真超集'], ['\\subseteq ', '⊆ 子集'],
        ['\\supseteq ', '⊇ 超集'], ['\\emptyset ', '∅ 空集合'], ['\\forall ', '∀ 任意'], ['\\exists ', '∃ 存在']]],
      ['數集', [['\\mathbb{N} ', 'ℕ 自然數'], ['\\mathbb{Z} ', 'ℤ 整數'], ['\\mathbb{Q} ', 'ℚ 有理數'], ['\\mathbb{R} ', 'ℝ 實數'], ['\\mathbb{C} ', 'ℂ 複數']]],
    ]],
  ];
  function pairs(s) { const a = s.split(' '), o = []; for (let i = 0; i < a.length; i += 2) o.push([a[i], a[i + 1]]); return o; }

  const CSS = `
#vme{border:1px solid #888;border-radius:10px;padding:0;width:min(860px,96vw);max-height:92vh;background:var(--bg,#fff);color:var(--fg,#222)}
#vme::backdrop{background:rgba(0,0,0,.35)}
#vme form{display:flex;flex-direction:column;gap:8px;padding:12px 14px;max-height:92vh;box-sizing:border-box;overflow:auto}
#vme h2{font-size:1.05rem;margin:0}
#vme .vme-g{display:flex;flex-wrap:wrap;gap:4px;align-items:center}
#vme .vme-g>span{font-size:.8rem;color:#666;min-width:4.5em}
#vme .vme-g button{min-width:2.2em;padding:2px 6px;font-size:.95rem;border:1px solid #bbb;border-radius:5px;background:#f6f6f6;color:inherit;cursor:pointer}
#vme .vme-g button:hover,#vme .vme-g button:focus-visible{background:#e3eeff;border-color:#4a7bd0}
#vme .vme-g select{font-size:.85rem}
#vme textarea{width:100%;box-sizing:border-box;font:1rem/1.4 Consolas,monospace;min-height:3.2em;resize:vertical}
#vme .vme-out{display:grid;grid-template-columns:4.5em 1fr;gap:4px 8px;font-size:.95rem;align-items:start}
#vme .vme-out dt{color:#666;font-size:.85rem}
#vme .vme-out dd{margin:0;min-height:1.4em;word-break:break-all}
#vme .vme-prev{font-size:1.3rem;overflow-x:auto}
#vme .vme-brl{font-size:1.4rem;letter-spacing:.05em}
#vme .vme-err{color:#b00020}
#vme .vme-acts{display:flex;gap:8px;justify-content:flex-end}
#vme .vme-acts button{padding:4px 14px}
@media (prefers-color-scheme:dark){#vme .vme-g button{background:#333;border-color:#666}#vme .vme-g>span,#vme .vme-out dt{color:#aaa}}
`;

  let dlg = null, ta = null, opts = null, ret = null, timer = 0, seq = 0;
  const $ = s => dlg.querySelector(s);

  function build() {
    const st = document.createElement('style');
    st.textContent = CSS;
    document.head.appendChild(st);
    dlg = document.createElement('dialog');
    dlg.id = 'vme';
    dlg.setAttribute('aria-labelledby', 'vme-title');
    const f = document.createElement('form');
    f.method = 'dialog';
    f.innerHTML = '<h2 id="vme-title">算式</h2><div class="vme-btns"></div>' +
      '<label for="vme-tex">LaTeX（Ctrl＋Enter 套用，Esc 取消）</label><textarea id="vme-tex" spellcheck="false" rows="2"></textarea>' +
      '<dl class="vme-out"><dt>預覽</dt><dd class="vme-prev" aria-hidden="true"></dd>' +
      '<dt id="vme-brl-l">點字</dt><dd class="vme-brl" aria-labelledby="vme-brl-l"></dd>' +
      '<dt id="vme-sp-l">念法</dt><dd class="vme-sp" aria-labelledby="vme-sp-l"></dd></dl>' +
      '<div class="vme-acts"><button type="button" class="btn pri" id="vme-ok">✓ 套用</button><button type="button" class="btn" id="vme-cancel">取消</button></div>';
    dlg.appendChild(f);
    document.body.appendChild(dlg);
    ta = $('#vme-tex');
    const box = $('.vme-btns');
    GROUPS.forEach(([name, items]) => {
      const g = document.createElement('div');
      g.className = 'vme-g'; g.setAttribute('role', 'group'); g.setAttribute('aria-label', name);
      g.innerHTML = '<span aria-hidden="true">' + name + '</span>';
      items.forEach(([label, tex, say]) => {
        const b = document.createElement('button');
        b.type = 'button'; b.textContent = label; b.title = say; b.setAttribute('aria-label', say);
        b.addEventListener('click', () => insert(tex));
        g.appendChild(b);
      });
      box.appendChild(g);
    });
    const g = document.createElement('div');
    g.className = 'vme-g';
    SELECTS.forEach(([name, groups]) => {
      const s = document.createElement('select');
      s.setAttribute('aria-label', name);
      s.innerHTML = '<option value="">' + name + '…</option>';
      groups.forEach(([gl, opts2]) => {
        const parent = gl ? document.createElement('optgroup') : s;
        if (gl) { parent.label = gl; s.appendChild(parent); }
        opts2.forEach(([v, t]) => { const o = document.createElement('option'); o.value = v; o.textContent = t; parent.appendChild(o); });
      });
      s.addEventListener('change', () => { if (s.value) { insert(s.value); s.value = ''; } });
      g.appendChild(s);
    });
    box.appendChild(g);
    ta.addEventListener('input', schedule);
    ta.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); apply(); } });
    $('#vme-ok').addEventListener('click', apply);
    $('#vme-cancel').addEventListener('click', () => close(true));
    dlg.addEventListener('cancel', e => { e.preventDefault(); close(true); });   // Esc
  }

  // 插入：有 {} 時游標放在第一個 {} 裡；有選字就把選的字包進第一個 {}
  function insert(tex) {
    const s = ta.selectionStart, e = ta.selectionEnd, v = ta.value, sel = v.slice(s, e);
    const bi = tex.indexOf('{}');
    let ins = tex, pos = s + tex.length;
    if (bi >= 0) {
      ins = tex.slice(0, bi + 1) + sel + tex.slice(bi + 1);
      pos = s + bi + 1 + sel.length + (sel ? 1 : 0);   // 包了字：游標放到 } 後面
    }
    ta.value = v.slice(0, s) + ins + v.slice(e);
    ta.selectionStart = ta.selectionEnd = pos;
    ta.focus();
    schedule();
  }

  function schedule() { clearTimeout(timer); timer = setTimeout(update, 250); }

  // ---------- 點字：數學點字頁的 latexToNemethAsc（隱藏的 iframe，第一次用到才載入） ----------
  let nc = null, ncLoading = null;
  function ncEngine() {
    if (nc) return Promise.resolve(nc);
    ncLoading = ncLoading || new Promise((resolve, reject) => {
      const f = document.createElement('iframe');
      f.src = 'nemeth_converter.html';
      f.hidden = true; f.tabIndex = -1; f.setAttribute('aria-hidden', 'true'); f.style.display = 'none';
      const t0 = Date.now();
      const poll = () => {
        let w = null;
        try { w = f.contentWindow; } catch (e) { /* */ }
        if (w && typeof w.latexToNemethAsc === 'function' && typeof w.asc2brl === 'function') { nc = w; resolve(w); return; }
        if (Date.now() - t0 > 30000) { ncLoading = null; reject(new Error('數學點字轉換載入失敗')); return; }
        setTimeout(poll, 200);
      };
      f.onload = poll;
      document.body.appendChild(f);
    });
    return ncLoading;
  }
  function brailleOf(tex) {
    return ncEngine().then(w => w.asc2brl(w.latexToNemethAsc(tex)));
  }

  // ---------- 念法：math-speech.js（MathCAT） ----------
  let speechLoading = null;
  function speechEngine() {
    if (window.vitoolsMathSpeech) return Promise.resolve(window.vitoolsMathSpeech);
    speechLoading = speechLoading || new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'math-speech.js';
      s.onload = () => window.vitoolsMathSpeech ? resolve(window.vitoolsMathSpeech) : reject(new Error('念法載入失敗'));
      s.onerror = () => { speechLoading = null; reject(new Error('念法載入失敗')); };
      document.head.appendChild(s);
    });
    return speechLoading;
  }

  function update() {
    const tex = ta.value.trim(), my = ++seq;
    const prev = $('.vme-prev'), brl = $('.vme-brl'), sp = $('.vme-sp');
    [prev, brl, sp].forEach(el => el.classList.remove('vme-err'));
    if (!tex) { prev.textContent = ''; brl.textContent = ''; sp.textContent = ''; return; }
    // 用非同步的 tex2mmlPromise：\ce（化學式）這類擴充沒載入時會先載入再轉；同步的 tex2mml 會失敗（MathJax retry），而且之後一直轉不出來
    if (window.MathJax && MathJax.tex2mmlPromise) {
      MathJax.tex2mmlPromise(tex, { display: true }).then(mml => {
        if (my !== seq) return;
        prev.innerHTML = mml;
        if (/<merror|mathcolor="red"/.test(mml)) prev.classList.add('vme-err');
      }).catch(e => { if (my === seq) { prev.textContent = 'LaTeX 有錯：' + (e.message || e); prev.classList.add('vme-err'); } });
    } else prev.textContent = tex;
    brl.textContent = nc ? '' : '載入點字轉換…';
    brailleOf(tex).then(b => { if (my === seq) brl.textContent = b; })
      .catch(e => { if (my === seq) { brl.textContent = '轉不出點字：' + (e.message || e); brl.classList.add('vme-err'); } });
    sp.textContent = window.vitoolsMathSpeech ? '' : '載入念法…';
    speechEngine().then(m => m.toSpeech('\\(' + tex + '\\)'))
      .then(r => { if (my !== seq) return; if (r.failed.length) { sp.textContent = '念不出來（LaTeX 可能有錯）'; sp.classList.add('vme-err'); } else sp.textContent = r.text.trim(); })
      .catch(e => { if (my === seq) { sp.textContent = e.message || String(e); sp.classList.add('vme-err'); } });
  }

  function apply() {
    const tex = ta.value.trim(), o = opts;
    close(false);
    if (o && o.onApply) o.onApply(tex);
  }
  function close(cancel) {
    const o = opts;
    opts = null;
    clearTimeout(timer);
    if (dlg.open) dlg.close();
    if (ret && ret.focus) { try { ret.focus({ preventScroll: true }); } catch (e) { /* */ } }
    ret = null;
    if (cancel && o && o.onCancel) o.onCancel();
  }

  function open(o) {
    if (!dlg) build();
    if (dlg.open) close(true);
    opts = o || {};
    ret = document.activeElement;
    $('#vme-title').textContent = opts.title || '算式';
    ta.value = opts.tex || '';
    dlg.showModal();
    ta.focus();
    ta.selectionStart = ta.selectionEnd = ta.value.length;
    update();
  }

  window.vitoolsMathEditor = { open, isOpen: () => !!(dlg && dlg.open), close: () => dlg && close(true) };
})();
