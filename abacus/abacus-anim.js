/*
 * 撥珠動畫：把一題加、減、乘法拆成一步一步的撥珠動作，畫在上 1 珠、下 4 珠的算盤上。
 * 乘法照直式從個位開始，每一位的乘積加在同一位和左邊一位，乘積照九九唸法先撥高位；
 * 兩位數乘數一行一行做（76 × 58 先算 76 × 8，再算 76 × 5），跟出題頁 mulTrace 同順序。
 * 順序照出題頁的 trace()：從個位往左，進位、借位時先動左邊一檔，再回來用補數修正。
 * abacusSteps(x, y, op) 回傳 [{ d: 每一檔的數字（個位在前）, moved: 動到的檔, text }]，node 也能用。
 */
(function (g) {
  'use strict';
  const PLACE = ['個位', '十位', '百位', '千位', '萬位', '十萬位'];

  function abacusSteps(x, y, op) {
    const d = String(op === '×' ? 0 : x).split('').reverse().map(Number);
    while (d.length < 6) d.push(0);
    const steps = [{ d: d.slice(), moved: [], text: `算盤上撥好 ${x}。` }];
    let pending = '';
    const push = (moved, text) => {
      steps.push({ d: d.slice(), moved, text: pending + text });
      pending = '';
    };

    // 這一檔直接加 v（保證加完不超過 9），下珠不夠就用小補數
    function addDirect(k, v) {
      const a = d[k], low = a % 5, R = PLACE[k];
      if (v >= 5) {
        d[k] += v; push([k], `${R}撥下上珠${v > 5 ? `，再撥上下珠 ${v - 5} 顆` : ''}（加 ${v}）。`);
      } else if (low + v <= 4) {
        d[k] += v; push([k], `${R}撥上下珠 ${v} 顆。`);
      } else {
        d[k] += 5; push([k], `${R}${low === 4 ? '下珠已經全部撥上去了' : `下珠只剩 ${4 - low} 顆空著`}，不夠加 ${v}，先撥下上珠（加 5）。`);
        d[k] -= 5 - v; push([k], `5 比 ${v} 多了 ${5 - v}，${5 - v} 是 ${v} 的小補數，所以拿掉下珠 ${5 - v} 顆。`);
      }
    }
    // 這一檔直接減 v（保證夠減），下珠不夠就用小補數
    function subDirect(k, v) {
      const a = d[k], low = a % 5, R = PLACE[k];
      if (v >= 5) {
        d[k] -= v; push([k], `${R}拿掉上珠${v > 5 ? `和下珠 ${v - 5} 顆` : ''}（減 ${v}）。`);
      } else if (low >= v) {
        d[k] -= v; push([k], `${R}拿掉下珠 ${v} 顆。`);
      } else {
        d[k] -= 5; push([k], `${R}${low ? `下珠只有 ${low} 顆` : '沒有撥上的下珠'}，不夠拿掉 ${v}，先拿掉上珠（減 5）。`);
        d[k] += 5 - v; push([k], `5 比 ${v} 多減了 ${5 - v}，${5 - v} 是 ${v} 的小補數，所以撥上下珠 ${5 - v} 顆。`);
      }
    }
    function add(k, v) {
      const a = d[k], R = PLACE[k];
      if (a + v <= 9) return addDirect(k, v);
      const c = 10 - v;
      pending += `${R}是 ${a}，加 ${v} 會超過 9，這一檔不夠加。先在${PLACE[k + 1]}加 1（就是${R}加 10）：`;
      add(k + 1, 1);
      pending += `10 比 ${v} 多了 ${c}，${c} 是 ${v} 的大補數，所以${R}拿掉 ${c}：`;
      subDirect(k, c);
    }
    function sub(k, v) {
      const a = d[k], R = PLACE[k];
      if (a >= v) return subDirect(k, v);
      const c = 10 - v;
      pending += `${R}是 ${a}，不夠減 ${v}。先在${PLACE[k + 1]}減 1（就是${R}減 10）：`;
      sub(k + 1, 1);
      pending += `10 比 ${v} 多減了 ${c}，${c} 是 ${v} 的大補數，所以${R}加回 ${c}：`;
      addDirect(k, c);
    }

    // 把 n 從第 shift 檔開始加上去（或減掉）。加減法一檔一檔從右往左；
    // 乘法的乘積照九九唸法先撥高位（highFirst），例如 42 先撥 4 再撥 2
    function apply(n, shift, f, verb, label = true, highFirst = false) {
      const ns = String(n).split('').reverse().map((v, j) => [shift + j, +v]).filter(([, v]) => v);
      if (highFirst) ns.reverse();
      const many = label && ns.length > 1;
      ns.forEach(([k, v]) => {
        if (many) pending += `${PLACE[k]}${verb} ${v}。`;
        f(k, v);
      });
    }

    if (op === '×' && y >= 10) {
      // 兩位數乘數：照直式一行一行做，76 × 58 先算 76 × 8，再算 76 × 5；每一行從被乘數的個位開始。
      // 九九的乘積撥在「兩個數字的位數相加」那一位起，照唸法先撥高位。算盤上邊乘邊加。
      const xs = String(x).split('').reverse().map(Number), ys = String(y).split('').reverse().map(Number);
      steps[0].text = `算盤先清空。${x} × ${y}，跟直式一樣：${ys.map(b => `先算 ${x} × ${b}`).join('，再算 ').replace(/，再算 先算/g, '，再算')}。`;
      const rows = [];
      ys.forEach((b, j) => {
        if (!b) { push([], `乘數的${PLACE[j]}是 0，這一行不用撥。`); rows.push(0); return; }
        xs.forEach((a, i) => {
          const p = a * b, k = i + j;
          if (!p) { push([], `${b} × ${a} = 0，不用撥。`); return; }
          pending += `${b} × ${a} = ${p}，${PLACE[j]} × ${PLACE[i]}，`;
          pending += p >= 10 ? `${Math.floor(p / 10)} 加在${PLACE[k + 1]}、${p % 10 ? `${p % 10} 加在${PLACE[k]}` : `0 不用撥`}：` : `加在${PLACE[k]}：`;
          apply(p, k, add, '加', false, true);
        });
        rows.push(x * b);
        const last = steps[steps.length - 1], now = last.d.reduce((s, v, t) => s + v * 10 ** t, 0);
        if (j === 0) last.text += `第一行做完：算盤上是 ${now}，就是直式第一行 ${x} × ${b} 的答案。`;
        else last.text += `第二行 ${x} × ${b} = ${rows[1]}，往左一位就是 ${rows[1] * 10}；${rows[0]} + ${rows[1] * 10} = ${now}，算盤上已經加好了。`;
      });
    } else if (op === '×') {
      // 照直式從個位開始：每一位乘 y 的乘積，加在同一位（和左邊一位）
      steps[0].text = `算盤先清空。${x} × ${y}，從個位開始乘。`;
      String(x).split('').reverse().map(Number).forEach((xi, k) => {
        const p = xi * y, R = PLACE[k];
        if (!p) { push([], `${R} ${xi} × ${y} = 0，不用撥。`); return; }
        pending += `${R} ${xi} × ${y} = ${p}`;
        if (k) pending += `，是 ${p} 個${['', '十', '百', '千'][k]}`;
        pending += p >= 10 ? `，${Math.floor(p / 10)} 加在${PLACE[k + 1]}、${p % 10} 加在${R}：` : `，加在${R}：`;
        apply(p, k, add, '加', false, true);
      });
    } else {
      apply(y, 0, op === '+' ? add : sub, op === '+' ? '加' : '減');
    }
    const ans = op === '+' ? x + y : op === '-' ? x - y : x * y;
    steps[steps.length - 1].text += `答案 ${ans}。`;
    return steps;
  }

  // ── 畫面 ──────────────────────────────────────────────
  const CSS = `
.abd{border:1px solid var(--line);border-radius:10px;background:var(--card);padding:12px 14px;margin:12px 0}
.abd-frame{position:relative;margin:4px auto 0;border:6px solid var(--abd-wood);border-radius:6px;background:var(--abd-bg);height:262px}
.abd-beam{position:absolute;left:0;right:0;top:80px;height:8px;background:var(--abd-wood)}
.abd-rod{position:absolute;top:0;bottom:0;width:5px;margin-left:-2.5px;background:var(--abd-rod)}
.abd-bead{position:absolute;width:50px;height:24px;margin-left:-25px;border-radius:50%;background:var(--abd-bead);
  border:2px solid var(--abd-edge);transition:top .45s ease,background-color .2s}
.abd-bead.moved{background:var(--abd-moved);border-color:var(--abd-moved-edge)}
.abd-labels{position:relative;height:3.2em;margin:4px auto 0;font-size:.9rem;line-height:1.5}
.abd-labels span{position:absolute;width:56px;margin-left:-28px;text-align:center;color:var(--muted)}
.abd-labels span b{display:block;font-size:1.1rem;color:var(--fg)}
.abd-labels span.on{color:var(--abd-moved);font-weight:700}
.abd-text{min-height:3.4em;margin:8px 0 4px;font-size:1.05rem}
.abd-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.abd button{font:inherit;font-size:.95rem;padding:4px 14px;border-radius:6px;border:1px solid var(--line);background:var(--bg);color:var(--fg);cursor:pointer}
.abd button:disabled{opacity:.45;cursor:default}
.abd-count{color:var(--muted);font-size:.9rem}
.abd ol{margin:10px 0 0;padding-left:1.6em;font-size:.95rem}
.abd ol li{cursor:pointer;border-radius:4px;padding:0 4px}
.abd ol li.on{background:var(--abd-hl);font-weight:600}
.abd-own{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:10px;padding-bottom:10px;border-bottom:1px solid var(--line)}
.abd-own .abd-q{display:flex;flex-wrap:nowrap;gap:6px;align-items:center;white-space:nowrap}
.abd-own input{width:4em;font:inherit;padding:2px 6px}
.abd-own select{font:inherit}
.abd-err{color:#c0392b}
:root{--abd-wood:#4a2c12;--abd-bg:#fffdf7;--abd-rod:#5c4a36;--abd-bead:#c06a1c;--abd-edge:#3d2208;--abd-moved:#0047b3;--abd-moved-edge:#001f52;--abd-hl:#ffe9a3}
:root[data-theme="dark"]{--abd-wood:#b07a45;--abd-bg:#121110;--abd-rod:#9c8a72;--abd-bead:#f0a85a;--abd-edge:#fff1dc;--abd-moved:#5aa9ff;--abd-moved-edge:#ffffff;--abd-hl:#5a4a12}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--abd-wood:#b07a45;--abd-bg:#121110;--abd-rod:#9c8a72;--abd-bead:#f0a85a;--abd-edge:#fff1dc;--abd-moved:#5aa9ff;--abd-moved-edge:#ffffff;--abd-hl:#5a4a12}}
@media (prefers-reduced-motion: reduce){.abd-bead{transition:none}}
`;
  const ROD = 64, UP_OFF = 6, UP_ON = 55, LOW_ON = 89, LOW_OFF = 152, BEAD = 24;

  function mount(box, opts) {
    if (!document.getElementById('abd-css')) {
      const st = document.createElement('style'); st.id = 'abd-css'; st.textContent = CSS;
      document.head.appendChild(st);
    }
    box.classList.add('abd');
    box.innerHTML = `
      ${opts.custom ? `<form class="abd-own"><span class="abd-q">出題：
        <input type="number" min="0" max="9999" aria-label="第一個數" required>
        <select aria-label="運算"><option value="+">＋</option><option value="-">－</option><option value="×">×</option></select>
        <input type="number" min="1" max="9999" aria-label="第二個數" required>
        <button type="submit">看步驟</button></span><span class="abd-err" role="alert"></span></form>` : ''}
      <div class="abd-frame" aria-hidden="true"><div class="abd-beam"></div></div>
      <div class="abd-labels" aria-hidden="true"></div>
      <p class="abd-text" aria-live="polite"></p>
      <div class="abd-bar">
        <button type="button" data-a="prev">上一步</button>
        <button type="button" data-a="next">下一步</button>
        <button type="button" data-a="play">自動播放</button>
        <button type="button" data-a="reset">重來</button>
        <span class="abd-count"></span>
      </div>
      <ol></ol>`;
    const frame = box.querySelector('.abd-frame'), labels = box.querySelector('.abd-labels');
    const text = box.querySelector('.abd-text'), count = box.querySelector('.abd-count'), list = box.querySelector('ol');
    const btn = a => box.querySelector(`[data-a="${a}"]`);
    let steps = [], i = 0, rods = 0, beads = [], timer = null;

    function load(x, y, op) {
      stop();
      steps = abacusSteps(x, y, op);
      const top = Math.max(x, op === '+' ? x + y : op === '×' ? x * y : x);
      rods = Math.max(2, String(top).length);
      const w = rods * ROD;
      frame.style.width = w + 12 + 'px'; labels.style.width = w + 'px';
      frame.querySelectorAll('.abd-rod,.abd-bead').forEach(e => e.remove());
      beads = [];
      for (let r = 0; r < rods; r++) {
        const k = rods - 1 - r, cx = r * ROD + ROD / 2;  // k：0 是個位，畫在最右邊
        const rod = document.createElement('div'); rod.className = 'abd-rod'; rod.style.left = cx + 'px'; frame.appendChild(rod);
        const set = [];
        for (let b = 0; b < 5; b++) {
          const e = document.createElement('div'); e.className = 'abd-bead'; e.style.left = cx + 'px';
          frame.appendChild(e); set.push(e);
        }
        beads[k] = set;  // set[0] 上珠，set[1..4] 下珠（1 最靠近梁）
      }
      labels.innerHTML = Array.from({ length: rods }, (_, r) =>
        `<span style="left:${r * ROD + ROD / 2}px">${['個位', '十位', '百位', '千位', '萬位'][rods - 1 - r]}<b></b></span>`).join('');
      list.innerHTML = steps.map(s => `<li>${s.text}</li>`).join('');
      list.setAttribute('aria-label', `${x} ${op === '-' ? '−' : op} ${y} 的撥珠步驟`);
      go(0);
    }

    function go(n) {
      i = Math.max(0, Math.min(steps.length - 1, n));
      const s = steps[i];
      for (let k = 0; k < rods; k++) {
        const v = s.d[k], up = v >= 5, low = v % 5, mv = s.moved.includes(k);
        const set = beads[k];
        set[0].style.top = (up ? UP_ON : UP_OFF) + 'px';
        for (let b = 1; b <= 4; b++) set[b].style.top = (b <= low ? LOW_ON + (b - 1) * BEAD : LOW_OFF + (b - 1) * BEAD) + 'px';
        const prev = i > 0 ? steps[i - 1].d[k] : v;
        set[0].classList.toggle('moved', mv && (prev >= 5) !== up);
        for (let b = 1; b <= 4; b++) set[b].classList.toggle('moved', mv && (b <= prev % 5) !== (b <= low));
        const lab = labels.children[rods - 1 - k];
        lab.classList.toggle('on', mv); lab.querySelector('b').textContent = v;
      }
      text.textContent = s.text;
      count.textContent = `第 ${i + 1} 步，共 ${steps.length} 步`;
      [...list.children].forEach((li, j) => li.classList.toggle('on', j === i));
      btn('prev').disabled = i === 0; btn('next').disabled = i === steps.length - 1;
    }
    function stop() { clearInterval(timer); timer = null; btn('play').textContent = '自動播放'; }

    btn('prev').onclick = () => { stop(); go(i - 1); };
    btn('next').onclick = () => { stop(); go(i + 1); };
    btn('reset').onclick = () => { stop(); go(0); };
    btn('play').onclick = () => {
      if (timer) return stop();
      if (i === steps.length - 1) go(0);
      btn('play').textContent = '暫停';
      timer = setInterval(() => { if (i >= steps.length - 1) stop(); else go(i + 1); }, 2200);
    };
    list.onclick = e => { const li = e.target.closest('li'); if (li) { stop(); go([...list.children].indexOf(li)); } };

    const form = box.querySelector('.abd-own');
    if (form) {
      const [ix, iy] = form.querySelectorAll('input'), sel = form.querySelector('select'), err = form.querySelector('.abd-err');
      ix.value = opts.x; iy.value = opts.y; sel.value = opts.op;
      form.onsubmit = e => {
        e.preventDefault();
        const x = +ix.value, y = +iy.value, op = sel.value;
        err.textContent = '';
        if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 1 || x > 9999 || y > 9999) { err.textContent = '請輸入 0～9999 的整數'; return; }
        if (op === '-' && y > x) { err.textContent = '減法的第二個數不能比第一個數大'; return; }
        if (op === '×' && (y > 99 || x > (y > 9 ? 99 : 999))) { err.textContent = '乘法目前做到三位數 × 一位數、兩位數 × 兩位數；乘數三位數以上的撥法還沒整理'; return; }
        load(x, y, op);
      };
    }
    load(opts.x, opts.y, opts.op);
    return {
      // 換一題（例題按鈕用），自己出題的欄位也一起改
      show(x, y, op) {
        if (form) { const [ix, iy] = form.querySelectorAll('input'); ix.value = x; iy.value = y; form.querySelector('select').value = op; }
        load(x, y, op);
      },
      focus() { (btn('next').disabled ? btn('reset') : btn('next')).focus({ preventScroll: true }); },
      stop,
    };
  }

  g.abacusSteps = abacusSteps;
  g.AbacusDemo = { mount };
  if (typeof module !== 'undefined' && module.exports) module.exports = { abacusSteps };
})(typeof globalThis !== 'undefined' ? globalThis : this);
