/*
 * 規則對照頁：把 rules-data.js 的內容畫成頁面。符號表直接取自轉換程式用的符號（MB.brailleSigns），
 * 例子用轉換程式當場產生點字與五線譜，可以修改 ABC 看結果。
 */
(function () {
  'use strict';
  const MB = window.MB;
  const B = MB.brf;
  const S = MB.brailleSigns;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  /** 一個或數個點字方：Unicode 點字，加上點位文字（報讀軟體與明眼老師都看得懂）。 */
  function sign(brf) {
    const cells = [...brf].map((c) => B.dotsOf(c)).join('、');
    return `<span class="sign"><span class="sign-brl" data-brf="${esc(brf)}" aria-hidden="true"></span><span class="sign-dots">點 ${cells}</span></span>`;
  }
  function dotsText(brf) {
    return brf
      .split('\n')
      .map((line, i) =>
        `第 ${i + 1} 行：` +
        // 連續的空方合併成「空方 ×N」（例如置中的拍號前面的空方）
        line
          .match(/ +|[^ ]/g) || []
          .map((t) => (t[0] === ' ' ? (t.length > 1 ? `空方 ×${t.length}` : '空方') : B.dotsOf(t)))
          .join('、')
      )
      .join('\n');
  }

  // ---------- 點字顯示方式：和轉換器共用設定（Unicode 點字／ASCII／ASCII + SimBraille 字型；ASCII 大小寫） ----------
  function loadSettings() {
    try {
      return JSON.parse(localStorage.getItem('mbc:settings')) || {};
    } catch (e) {
      return {};
    }
  }
  function saveMode(mode) {
    try {
      localStorage.setItem('mbc:settings', JSON.stringify(Object.assign(loadSettings(), { brlMode: mode })));
    } catch (e) {}
  }
  const modeSel = $('brl-mode');
  const settings = loadSettings();
  if (settings.brlMode && modeSel.querySelector(`option[value="${settings.brlMode}"]`)) modeSel.value = settings.brlMode;
  const caseBrf = (brf) => (settings.brfUpper ? brf : B.toLowerBrf(brf));
  /** 依顯示方式畫出元素的點字（元素的 data-brf 是大寫 BRF）。 */
  function paint(el) {
    const brf = el.dataset.brf || '';
    const mode = modeSel.value;
    el.classList.toggle('ascii', mode !== 'unicode');
    el.classList.toggle('simbraille', mode === 'brf-font');
    el.textContent = mode === 'unicode' ? B.toUnicode(brf) : caseBrf(brf);
  }
  const paintAll = () => document.querySelectorAll('[data-brf]').forEach(paint);
  modeSel.addEventListener('change', () => {
    saveMode(modeSel.value);
    paintAll();
  });
  // SimBraille 字型只在視障輔助工具集裡有；載不到就不提供這個顯示方式
  function hideFontOption() {
    const opt = modeSel.querySelector('option[value="brf-font"]');
    opt.hidden = opt.disabled = true;
    if (modeSel.value === 'brf-font') {
      modeSel.value = 'brf';
      paintAll();
    }
  }
  if (document.fonts && document.fonts.load) document.fonts.load("16px 'SimBraille'").then((f) => f.length || hideFontOption(), hideFontOption);
  else hideFontOption();

  // ---------- 符號表 ----------
  const STEPS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  const VALUE_COLS = ['全音符（十六分）', '二分音符（三十二分）', '四分音符（六十四分）', '八分音符（一百二十八分）'];
  const TABLES = {
    notes: () => `
      <div class="table-wrap"><table>
        <caption>音符：每格是一個點字方，括號內是同一個符號的另一種時值</caption>
        <thead><tr><th scope="col">音名</th>${VALUE_COLS.map((c) => `<th scope="col">${c}</th>`).join('')}</tr></thead>
        <tbody>
          ${STEPS.map((st) => `<tr><th scope="row">${st}</th>${S.NOTE[st].map((b) => `<td>${sign(b)}</td>`).join('')}</tr>`).join('')}
          <tr><th scope="row">休止符</th>${S.REST.map((b) => `<td>${sign(b)}</td>`).join('')}</tr>
        </tbody>
      </table></div>
      <p class="hint">附點：音符後加 ${sign("'")}。大時值記號 ${sign('^<1')}、小時值記號 ${sign(',<1')}。</p>`,
    octaves: () => {
      const abcOf = (o) => (o >= 5 ? 'c' + "'".repeat(o - 5) + '–b' + "'".repeat(o - 5) : 'C' + ','.repeat(4 - o) + '–B' + ','.repeat(4 - o));
      const rows = [1, 2, 3, 4, 5, 6, 7].map(
        (o) => `<tr><th scope="row">第 ${o} 音層${o === 4 ? '（中央 C）' : ''}</th><td>${sign(S.OCT[o])}</td><td>C${o}–B${o}</td><td><code>${abcOf(o)}</code></td></tr>`
      );
      return `
      <div class="table-wrap"><table>
        <caption>音層記號：寫在音符前面</caption>
        <thead><tr><th scope="col">音層</th><th scope="col">記號</th><th scope="col">音域</th><th scope="col">ABC 寫法</th></tr></thead>
        <tbody>${rows.join('')}</tbody>
      </table></div>
      <p class="hint">比第 1 音層更低用 ${sign(S.OCT[0])}，比第 7 音層更高用 ${sign(S.OCT[8])}。</p>`;
    },
    intervals: () => {
      const names = { 1: '二度', 2: '三度', 3: '四度', 4: '五度', 5: '六度', 6: '七度', 0: '八度' };
      return `
      <div class="table-wrap"><table>
        <caption>音程記號：寫在和弦的寫出音後面</caption>
        <thead><tr>${[1, 2, 3, 4, 5, 6, 0].map((k) => `<th scope="col">${names[k]}</th>`).join('')}</tr></thead>
        <tbody><tr>${[1, 2, 3, 4, 5, 6, 0].map((k) => `<td>${sign(S.INTERVAL[k])}</td>`).join('')}</tr></tbody>
      </table></div>
      <p class="hint">超過八度的音程用同一組記號（例如十度寫成三度），需要時在前面加音層記號。</p>`;
    },
  };

  // ---------- 例子：可修改的 ABC，當場轉出點字與五線譜 ----------
  function exampleHtml(sec, ex, k) {
    const id = `${sec.id}-${k + 1}`;
    return `
      <div class="example" id="ex-${id}">
        <h4 id="ex-${id}-h">例 ${k + 1}：${esc(ex.title)}</h4>
        <div class="ex-grid">
          <div class="ex-col">
            <label class="ex-label" for="ex-${id}-abc">ABC（可以修改）</label>
            <textarea id="ex-${id}-abc" spellcheck="false" autocomplete="off" rows="${Math.min(10, ex.abc.split('\n').length + 1)}">${esc(ex.abc)}</textarea>
            <div class="ex-actions"><button type="button" id="ex-${id}-reset" disabled>還原例子</button><span class="hint" id="ex-${id}-state" aria-live="polite"></span></div>
          </div>
          <div class="ex-col">
            <div class="ex-label" id="ex-${id}-brl-label">點字</div>
            <pre class="ex-brl" id="ex-${id}-brl" aria-labelledby="ex-${id}-brl-label"></pre>
            <details class="ex-dots"><summary>逐方點位</summary><pre id="ex-${id}-dots"></pre></details>
            <ul class="ex-warn" id="ex-${id}-warn"></ul>
          </div>
        </div>
        <div class="ex-staff" id="ex-${id}-staff"></div>
        <p class="ex-note" id="ex-${id}-note">${esc(ex.note)}</p>
      </div>`;
  }

  function bindExample(sec, ex, k) {
    const id = `${sec.id}-${k + 1}`;
    const ta = $(`ex-${id}-abc`);
    const reset = $(`ex-${id}-reset`);
    const state = $(`ex-${id}-state`);
    let timer = 0;
    function update() {
      const abc = ta.value;
      const changed = abc !== ex.abc;
      reset.disabled = !changed;
      state.textContent = changed ? '已修改；下方說明是針對原本的例子' : '';
      let brf = '';
      let warnings = [];
      try {
        const r = MB.parseAbc(abc);
        const b = MB.toBraille(r.score);
        brf = b.brf;
        warnings = r.warnings.concat(b.warnings);
      } catch (e) {
        warnings = [{ msg: '轉換時發生錯誤：' + e.message }];
      }
      const out = $(`ex-${id}-brl`);
      out.dataset.brf = brf;
      paint(out);
      $(`ex-${id}-dots`).textContent = brf ? dotsText(brf) : '';
      $(`ex-${id}-warn`).innerHTML = warnings.map((w) => `<li>${esc(w.msg)}</li>`).join('');
      const staff = $(`ex-${id}-staff`);
      if (window.ABCJS) {
        try {
          ABCJS.renderAbc(staff, abc, { responsive: 'resize', paddingleft: 10, paddingright: 10, add_classes: true });
          const svg = staff.querySelector('svg');
          if (svg) {
            const label = '五線譜：' + ex.title;
            svg.setAttribute('aria-label', label);
            const t = svg.querySelector('title');
            if (t) t.textContent = label;
          }
        } catch (e) {
          staff.textContent = '五線譜顯示失敗：' + e.message;
        }
      } else if (!staff.textContent) {
        staff.innerHTML = '<p class="hint">無法載入 abcjs（需要網路連線），五線譜暫時無法顯示。</p>';
      }
    }
    ta.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(update, 250);
    });
    reset.addEventListener('click', () => {
      ta.value = ex.abc;
      update();
      ta.focus();
    });
    update();
  }

  // ---------- 整頁 ----------
  $('toc').innerHTML = MB.rules
    .map((sec) => `<li><a href="#${sec.id}">${esc(sec.title)}</a>（${sec.examples.length} 個例子）</li>`)
    .join('');
  $('rules').innerHTML = MB.rules
    .map(
      (sec, i) => `
      <section class="pane rule" id="${sec.id}" aria-labelledby="${sec.id}-h">
        <h2 id="${sec.id}-h">${i + 1}. ${esc(sec.title)} <span class="par">BANA ${esc(sec.par)}</span></h2>
        <div class="rule-body">${sec.body}</div>
        <h3>符號表</h3>
        ${sec.tables.map((t) => TABLES[t]()).join('')}
        <h3>ABC 怎麼寫</h3>
        <div class="rule-body">${sec.abc}</div>
        <h3>例子</h3>
        ${sec.examples.map((ex, k) => exampleHtml(sec, ex, k)).join('')}
        <p class="to-top"><a href="#top">回到目錄</a></p>
      </section>`
    )
    .join('');
  MB.rules.forEach((sec) => sec.examples.forEach((ex, k) => bindExample(sec, ex, k)));
  paintAll();
})();
