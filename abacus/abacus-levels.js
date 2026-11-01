/*
 * 珠算分級資料：三個頁面（出題練習、各級撥珠教法、教學法筆記）共用，改這裡三頁一起變。
 * 每一級：id、名稱（難在哪）、怎麼判斷、題型（固定的才寫）、代表例題（add／sub／mul／div）。
 * 1～4 級的例題依題型排：20 以內、兩位數 ± 一位數、兩位數 ± 兩位數。
 * part：同一組裡再分表（第 5 級分 5a、5b 和 5c 兩張表）。
 * 第 5c 級只有從個位開始撥才會出現；5d 只在從最高位開始時列出（從個位開始時這種題大多歸 5c）。node 也能用（tools/check-abacus.mjs）。
 */
(function (g) {
  'use strict';
  const GROUPS = [
    { key: '1', title: '第 1～4 級：基本補數' },
    { key: '5', title: '第 5 級：進位、借位延伸' },
    { key: '0', title: '九九乘法（十十乘法）' },
    { key: '6', title: '第 6 級：乘以一位數' },
    { key: '7', title: '第 7 級：乘以兩位數' },
    { key: '8', title: '第 8 級：除以一位數' },
    { key: '9', title: '第 9 級：除以兩位數' },
  ];
  const P5AB = '5a、5b：左邊一檔用小補數、連續進位借位';
  const P5C = '5c：進位撞上左邊一檔還沒撥的數（只有從個位開始才有）';
  const P5D = '5d：兩步都難（從最高位開始）';
  const LEVELS = [
    { id: '1', name: '不動補數', desc: '珠子夠，直接撥', add: '5+3、21+3、32+15', sub: '9−4、37−5、47−21' },
    { id: '2', name: '小補數', desc: '下珠不夠，要動上珠', add: '3+4、23+4、12+33', sub: '8−4、26−3、56−21' },
    { id: '3a', name: '大補數，修正只動下珠', desc: '大補數是 1～4，修正時只動下珠', add: '8+7、27+8、32+91', sub: '12−8、22−8、115−71' },
    { id: '3b', name: '大補數，修正會動上珠', desc: '大補數是 5～9，修正時上珠直接退或進', add: '6+5、16+5、61+52', sub: '11−5、32−3、113−51' },
    { id: '4', name: '大小補數同時（複合題）', desc: '動十位後，回到個位修正又要用小補數', add: '7+6、15+7、71+62', sub: '14−6、21−6、122−61' },
    { id: '5a-1', part: P5AB, name: '進位、借位時左邊一檔用小補數', desc: '加法左邊一檔是 4，進 1 要動上珠；減法左邊一檔是 5，借 1 要動上珠', add: '43+8、49+1', sub: '51−3、50−2' },
    { id: '5a-2', part: P5AB, name: '進位、借位時左邊一檔用小補數，又是複合題', desc: '左邊一檔進退位要用小補數，撥的那一檔又是複合題', add: '45+6', sub: '52−6' },
    { id: '5b-1', part: P5AB, name: '連續進位、借位', desc: '左邊一檔是 9（加）或 0（減），要再往左進位、借位', add: '98+3、99+1', sub: '100−1、103−4' },
    { id: '5b-2', part: P5AB, name: '連續進位、借位，又是複合題', desc: '連續進退位，撥的那一檔又是複合題', add: '95+6', sub: '101−6' },
    { id: '5b-3', part: P5AB, name: '連續進位、借位，最後一檔又用小補數', desc: '連續進退位到最後一檔是 4（加）或 5（減）', add: '493+8', sub: '502−7' },
    { id: '5c-1', part: P5C, name: '一次進退位', desc: '進位後，左邊一檔還要加（減）自己的數；那一檔簡單', add: '24+18', sub: '41−18' },
    { id: '5c-2', part: P5C, name: '一次進退位，左邊一檔要用小補數', desc: '左邊一檔加進位或扣借位後遇到 5', add: '34+28', sub: '62−28' },
    { id: '5c-3', part: P5C, name: '一次進退位，含複合題', desc: '進退位的那一檔是 4 級', add: '17+16、36+27', sub: '42−17、33−16' },
    { id: '5c-4', part: P5C, name: '兩次進退位', desc: '有兩檔以上都進位（或都借位）', add: '88+27', sub: '121−58' },
    { id: '5c-5', part: P5C, name: '兩次進退位，含複合題', desc: '其中一檔是 4 級', add: '57+68、75+48', sub: '132−47、143−67' },
    { id: '5d', part: P5D, name: '兩步都難', desc: '一步是複合題（4 級），另一步又要進退位延伸（5a、5b）；或兩步都要進退位延伸', add: '51+99、82+68', sub: '146−98、113−69' },
    { id: '九九', name: '九九乘法的答案', desc: '九九乘法的答案直接撥上去，練習撥在哪兩檔；也有 × 1、× 0、× 10（十十乘法）。跟撥珠難度無關，不分題目大小', form: '十十乘法', mul: '2×3、7×6、7×10' },
    { id: '6a', name: '加乘積直接撥', desc: '把乘積加上去時珠子夠，不用補數', form: '兩位數、三位數 × 一位數', mul: '21×4、34×2、20×3、312×3、207×3、3×46' },
    { id: '6b', name: '加乘積要用小補數', desc: '加乘積時下珠不夠，要動上珠', form: '兩位數、三位數 × 一位數', mul: '16×4、18×3、142×4' },
    { id: '6c', name: '加乘積要進位', desc: '加乘積時這一檔不夠加，要進位到左邊一檔', form: '兩位數、三位數 × 一位數', mul: '29×4、75×4、58×9、275×4' },
    { id: '7a', name: '直接撥', desc: '每一次加乘積都不用補數', form: '兩位數、三位數 × 兩位數', mul: '21×13、12×54、213×21、30×49' },
    { id: '7b', name: '要用小補數', desc: '有一次加乘積時下珠不夠，要動上珠，但不用進位', form: '兩位數、三位數 × 兩位數', mul: '12×13、23×12、123×13' },
    { id: '7c', name: '進位一次', desc: '加乘積時有一次這一檔不夠加，要進位', form: '兩位數、三位數 × 兩位數', mul: '24×13、34×12、132×24' },
    { id: '7d', name: '進位兩次以上', desc: '進位兩次以上，或一次進位又連到更左邊一檔', form: '兩位數、三位數 × 兩位數', mul: '76×58、22×48、324×79' },
    { id: '8a', name: '每一位都除得盡', desc: '每一位扣完都剛好是 0；28÷7 這種九九範圍的題目也在這一級', form: '兩位數到四位數 ÷ 一位數', div: '6÷2、28÷7、68÷2、486÷2' },
    { id: '8b', name: '要往下一位借來除', desc: '有一位扣完有剩，剩下的跟下一位合起來再除', form: '兩位數到四位數 ÷ 一位數', div: '52÷4、96÷4、736÷4' },
    { id: '8c', name: '有餘數', desc: '除到個位還有剩，剩下的比除數小', form: '兩位數到四位數 ÷ 一位數', div: '7÷2、14÷3、86÷4' },
    { id: '8d', name: '商有 0，或第一位比除數小', desc: '中間或後面不夠除要打 0；第一位不夠除而且商不只一位', form: '兩位數到四位數 ÷ 一位數', div: '80÷4、412÷4、240÷6、619÷3' },
    { id: '9a', name: '除數是整十', desc: '估商就是九九（250÷70 看 25÷7）', form: '兩位數到四位數 ÷ 兩位數', div: '60÷20、250÷70、840÷40、1680÷40' },
    { id: '9b', name: '除數第二位小（1～3）', desc: '除數看成小一號的整十，估的商只會剛好或太大', form: '兩位數到四位數 ÷ 兩位數', div: '84÷21、96÷32、256÷32、736÷23、5481÷63' },
    { id: '9c', name: '除數第二位大（7～9）', desc: '除數看成大一號的整十，估的商只會剛好或太小', form: '兩位數到四位數 ÷ 兩位數', div: '81÷27、174÷29、391÷17、1998÷27' },
    { id: '9d', name: '除數第二位中（4～6）', desc: '4 看成小一號、5 和 6 看成大一號的整十，離整十最遠，最容易估錯', form: '兩位數到四位數 ÷ 兩位數', div: '92÷24、96÷16、156÷26、875÷25、1032÷24' },
  ];
  const groupOf = id => (id === '九九' ? '0' : /^[1-4]/.test(id) ? '1' : id[0]);
  // 畫面上的級別名稱：「3a 級」；九九乘法沒有級數
  const lvTag = id => id === '九九' ? '九九' : id + ' 級';
  const groupTitle = key => (GROUPS.find(gr => gr.key === key) || {}).title || '';

  // 產生一組的分級表（教學法筆記、各級撥珠教法用）。第 5 級分兩張表；5c 的列只在從個位開始時顯示。
  function tableHtml(key) {
    const lvs = LEVELS.filter(l => groupOf(l.id) === key);
    const addsub = lvs.some(l => l.add);
    const parts = [];
    for (const l of lvs) {
      const cap = l.part || groupTitle(key);
      const last = parts[parts.length - 1];
      if (last && last.cap === cap) last.lvs.push(l); else parts.push({ cap, lvs: [l] });
    }
    return parts.map(({ cap, lvs: ls }) => {
      const low = ls.every(l => l.id.startsWith('5c')), high = ls.every(l => l.id === '5d');
      const head = addsub
        ? '<th scope="col">等級</th><th scope="col">名稱</th><th scope="col">怎麼判斷</th><th scope="col">加法例題</th><th scope="col">減法例題</th>'
        : '<th scope="col">等級</th><th scope="col">名稱</th><th scope="col">怎麼判斷</th><th scope="col">題型</th><th scope="col">例題</th>';
      const rows = ls.map(l => `<tr><td>${l.id}</td><td>${l.name}</td><td>${l.desc}</td>` +
        (addsub ? `<td>${l.add || '—'}</td><td>${l.sub || '—'}</td>` : `<td>${l.form || ''}</td><td>${l.mul || l.div || ''}</td>`) + '</tr>').join('');
      // 表格標題跟上面的組名一樣時只給報讀軟體（畫面上不重複）
      const capCls = cap === groupTitle(key) ? ' class="lv-cap-hidden"' : '';
      return `<div class="scroll"${low ? ' data-show="low"' : high ? ' data-show="high"' : ''}><table class="lv"><caption${capCls}>${cap}</caption><tr>${head}</tr>${rows}</table></div>`;
    }).join('');
  }
  if (typeof document !== 'undefined' && document.head) {
    const st = document.createElement('style');
    st.textContent = '.lv-cap-hidden{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}table.lv th:first-child,table.lv td:first-child{white-space:nowrap}';
    document.head.appendChild(st);
  }
  // 頁面上所有 <div data-level-table="5"></div> 換成分級表
  function renderTables(root) {
    (root || document).querySelectorAll('[data-level-table]').forEach(el => { el.innerHTML = tableHtml(el.dataset.levelTable); });
  }

  const api = { GROUPS, LEVELS, groupOf, groupTitle, lvTag, tableHtml, renderTables };
  g.AbacusLevels = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
